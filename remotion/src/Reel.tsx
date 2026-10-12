import React, {useEffect, useState} from 'react';
import {
	AbsoluteFill,
	Audio,
	continueRender,
	delayRender,
	interpolate,
	OffthreadVideo,
	Sequence,
	staticFile,
} from 'remotion';
import {BolinhaProvisoria} from './BolinhaProvisoria';
import {Cartela} from './Cartela';
import {
	CARTELAS_FRAMES,
	ENGRENZA,
	FPS,
	GANCHO_FRAMES,
	HOOK_COM_SOM,
	HOOK_INICIO_S,
	MUSICA_INICIO_S,
	MUSICA_VOLUME,
	ORIGINAL_VERDE,
	TEXTOS,
	TOTAL_FRAMES,
} from './config';
import {carregarFonte, montarCartelas, type Cartela as Dados} from './layout';

export type ReelProps = {
	tema: 'engrenza' | 'original';
	temHook: boolean;
	temMusica: boolean;
	detectar?: boolean;
};

if (TEXTOS.length !== CARTELAS_FRAMES.length) {
	throw new Error(
		`config.ts: ${TEXTOS.length} textos e ${CARTELAS_FRAMES.length} durações em CARTELAS_FRAMES. Precisa ter uma duração por texto.`,
	);
}

// micro-fade de 1 frame em cada ponta para a emenda do loop não estalar
const volumeMusica = (f: number) =>
	MUSICA_VOLUME *
	interpolate(f, [0, 1, TOTAL_FRAMES - 2, TOTAL_FRAMES - 1], [0, 1, 1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

export const Reel: React.FC<ReelProps> = ({tema: id, temHook, temMusica}) => {
	const tema = id === 'engrenza' ? ENGRENZA : ORIGINAL_VERDE;
	const [cartelas, setCartelas] = useState<Dados[] | null>(null);
	const [espera] = useState(() => delayRender('fonte e medidas do texto'));

	useEffect(() => {
		carregarFonte(tema).then(() => {
			setCartelas(montarCartelas(tema, TEXTOS));
			continueRender(espera);
		});
	}, [tema, espera]);

	if (!cartelas) return null;

	let inicio = GANCHO_FRAMES;
	return (
		<AbsoluteFill style={{backgroundColor: tema.escuro}}>
			<Sequence durationInFrames={GANCHO_FRAMES} name="gancho">
				{temHook ? (
					<OffthreadVideo
						src={staticFile('hook.mp4')}
						startFrom={Math.round(HOOK_INICIO_S * FPS)}
						muted={!HOOK_COM_SOM}
						style={{width: '100%', height: '100%', objectFit: 'cover'}}
					/>
				) : (
					<BolinhaProvisoria tema={tema} />
				)}
			</Sequence>
			{cartelas.map((dados, i) => {
				const de = inicio;
				inicio += CARTELAS_FRAMES[i];
				return (
					<Sequence key={i} from={de} durationInFrames={CARTELAS_FRAMES[i]} name={TEXTOS[i]}>
						<Cartela
							tema={tema}
							dados={dados}
							clara={i % 2 === 0}
							ultima={i === cartelas.length - 1}
						/>
					</Sequence>
				);
			})}
			{temMusica ? (
				<Audio
					src={staticFile('music.mp3')}
					startFrom={Math.round(MUSICA_INICIO_S * FPS)}
					volume={volumeMusica}
				/>
			) : null}
		</AbsoluteFill>
	);
};
