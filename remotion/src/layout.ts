import {fitText} from '@remotion/layout-utils';
import {staticFile} from 'remotion';
import {
	TAMANHO_FRASE_MAX,
	TAMANHO_PALAVRA_MAX,
	TEXTO_LARGURA_MAX,
	type Tema,
} from './config';

export type Cartela = {linhas: string[]; tamanho: number};

const carregadas = new Map<string, Promise<void>>();

export const carregarFonte = (tema: Tema): Promise<void> => {
	const {familia, arquivo, peso} = tema.fonte;
	if (!carregadas.has(familia)) {
		const face = new FontFace(familia, `url('${staticFile(arquivo)}')`, {
			weight: String(peso),
		});
		carregadas.set(
			familia,
			face.load().then((f) => {
				document.fonts.add(f);
			}),
		);
	}
	return carregadas.get(familia)!;
};

const caber = (tema: Tema, texto: string, teto: number) =>
	Math.min(
		teto,
		Math.floor(
			fitText({
				text: texto,
				withinWidth: TEXTO_LARGURA_MAX,
				fontFamily: tema.fonte.familia,
				fontWeight: tema.fonte.peso,
				letterSpacing: tema.fonte.espacamento,
			}).fontSize,
		),
	);

// Quebra em duas linhas o mais equilibradas possível.
const quebrar = (texto: string): string[] => {
	const palavras = texto.split(' ');
	let melhor = [texto];
	let pior = Infinity;
	for (let i = 1; i < palavras.length; i++) {
		const a = palavras.slice(0, i).join(' ');
		const b = palavras.slice(i).join(' ');
		const d = Math.max(a.length, b.length);
		if (d < pior) {
			pior = d;
			melhor = [a, b];
		}
	}
	return melhor;
};

// Primeira e última cartela são frases (pergunta e CTA): cada uma ocupa a largura útil.
// As do meio são as palavras grandes, todas no mesmo tamanho, como no original.
export const montarCartelas = (tema: Tema, textos: string[]): Cartela[] => {
	const ultimo = textos.length - 1;
	const meio = textos
		.map((t, i) => ({t, i}))
		.filter(({i}) => i > 0 && i < ultimo);

	const soltas = meio.filter(({t}) => !t.includes(' ') && !t.includes('\n'));
	const tamanhoPalavra = Math.min(
		TAMANHO_PALAVRA_MAX,
		...soltas.map(({t}) => caber(tema, t, TAMANHO_PALAVRA_MAX)),
	);

	return textos.map((texto, i) => {
		if (i === 0 || i === ultimo) {
			const linhas = texto.split('\n');
			return {
				linhas,
				tamanho: Math.min(...linhas.map((l) => caber(tema, l, TAMANHO_FRASE_MAX))),
			};
		}
		let linhas = texto.split('\n');
		let tamanho = Math.min(...linhas.map((l) => caber(tema, l, tamanhoPalavra)));
		// frase no meio das palavras: se ficar pequena demais numa linha só, vai para duas
		if (linhas.length === 1 && texto.includes(' ') && tamanho < tamanhoPalavra * 0.65) {
			linhas = quebrar(texto);
			tamanho = Math.min(...linhas.map((l) => caber(tema, l, tamanhoPalavra)));
		}
		return {linhas, tamanho};
	});
};

