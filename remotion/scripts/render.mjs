// Renderiza as duas versões em ../out/: reels-engrenza.mp4 e reels-original.mp4
// Uso: npm run render            (as duas)
//      npm run render Engrenza   (só uma)
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const saida = path.resolve(raiz, '..', 'out');
const chrome = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const browserExecutable = fs.existsSync(chrome) ? chrome : null;

const duracao = (arquivo) => {
	try {
		return Number(
			execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arquivo])
				.toString()
				.trim(),
		);
	} catch {
		return null;
	}
};

const hook = path.join(raiz, 'public', 'hook.mp4');
const musica = path.join(raiz, 'public', 'music.mp3');
console.log(fs.existsSync(hook) ? `hook.mp4: usando a sua bolinha (${duracao(hook)?.toFixed(2)}s)` : 'hook.mp4: não encontrado, usando a bolinha provisória');
console.log(fs.existsSync(musica) ? `music.mp3: encaixando (${duracao(musica)?.toFixed(2)}s)` : 'music.mp3: não encontrado, vídeo sai sem áudio');

// Lê um valor de src/config.ts (sem precisar compilar TypeScript)
const config = fs.readFileSync(path.join(raiz, 'src', 'config.ts'), 'utf8');
const ler = (nome) => {
	const m = config.match(new RegExp(`export const ${nome} = ([^;]+);`));
	if (!m) throw new Error(`não achei ${nome} em src/config.ts`);
	return m[1].trim();
};
const FPS = Number(ler('FPS'));
const GANCHO = Number(ler('GANCHO_FRAMES')) / FPS;
const DURACAO = (Number(ler('GANCHO_FRAMES')) + JSON.parse(ler('CARTELAS_FRAMES')).reduce((a, b) => a + b, 0)) / FPS;
const somDoHook = ler('HOOK_COM_SOM') === 'true' && fs.existsSync(hook);

// O AAC que sai do Remotion não compensa o atraso do encoder (~40ms de silêncio no começo),
// o que abriria um buraco na emenda do loop. Por isso a imagem vem do Remotion e o áudio
// é montado aqui pelo ffmpeg, com corte exato em DURACAO e fade de 8ms nas pontas.
const montarAudio = (video) => {
	const entradas = ['-i', video];
	const trilhas = [];
	if (fs.existsSync(musica)) {
		entradas.push('-i', musica);
		trilhas.push(`[${trilhas.length + 1}:a]atrim=start=${ler('MUSICA_INICIO_S')}:duration=${DURACAO},asetpts=PTS-STARTPTS,volume=${ler('MUSICA_VOLUME')}[t${trilhas.length}]`);
	}
	if (somDoHook) {
		entradas.push('-i', hook);
		trilhas.push(`[${trilhas.length + 1}:a]atrim=start=${ler('HOOK_INICIO_S')}:duration=${GANCHO},asetpts=PTS-STARTPTS,afade=t=out:st=${GANCHO - 0.03}:d=0.03[t${trilhas.length}]`);
	}
	if (!trilhas.length) return;
	const rotulos = trilhas.map((_, i) => `[t${i}]`).join('');
	const filtro = [
		...trilhas,
		`${rotulos}amix=inputs=${trilhas.length}:normalize=0:duration=longest,aresample=48000,apad=whole_dur=${DURACAO},atrim=0:${DURACAO},afade=t=in:d=0.008,afade=t=out:st=${DURACAO - 0.008}:d=0.008[a]`,
	].join(';');
	const tmp = video.replace(/\.mp4$/, '.tmp.mp4');
	execFileSync('ffmpeg', ['-y', '-v', 'error', ...entradas, '-filter_complex', filtro, '-map', '0:v', '-map', '[a]',
		'-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', tmp]);
	fs.renameSync(tmp, video);
};

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['Engrenza', 'Original'];
const serveUrl = await bundle({entryPoint: path.join(raiz, 'src', 'index.ts')});
fs.mkdirSync(saida, {recursive: true});

for (const id of ids) {
	const inputProps = {detectar: false, temHook: fs.existsSync(hook), temMusica: fs.existsSync(musica)};
	const composition = await selectComposition({serveUrl, id, inputProps, browserExecutable});
	let ultimo = -1;
	const outputLocation = path.join(saida, `reels-${id.toLowerCase()}.mp4`);
	await renderMedia({
		composition,
		serveUrl,
		codec: 'h264',
		crf: 18,
		pixelFormat: 'yuv420p',
		imageFormat: 'png',
		outputLocation,
		browserExecutable,
		inputProps,
		muted: true,
		onProgress: ({progress}) => {
			const p = Math.floor(progress * 10) * 10;
			if (p !== ultimo) process.stdout.write(`${id}: ${(ultimo = p)}%\n`);
		},
	});
	montarAudio(outputLocation);
	console.log(`  -> ${path.relative(process.cwd(), outputLocation)}  hook=${composition.props.temHook} musica=${composition.props.temMusica}`);
}
