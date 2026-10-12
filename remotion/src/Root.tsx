import React from 'react';
import {CalculateMetadataFunction, Composition, staticFile} from 'remotion';
import {ALTURA, FPS, LARGURA, TOTAL_FRAMES} from './config';
import {Reel, type ReelProps} from './Reel';

const existe = async (arquivo: string) => {
	try {
		const r = await fetch(staticFile(arquivo), {method: 'HEAD'});
		return r.ok;
	} catch {
		return false;
	}
};

// Usa public/hook.mp4 e public/music.mp3 se estiverem lá.
// (o scripts/render.mjs já confere no disco e manda detectar: false)
const detectarArquivos: CalculateMetadataFunction<ReelProps> = async ({props}) =>
	props.detectar === false
		? {}
		: {props: {...props, temHook: await existe('hook.mp4'), temMusica: await existe('music.mp3')}};

const comum = {
	component: Reel,
	durationInFrames: TOTAL_FRAMES,
	fps: FPS,
	width: LARGURA,
	height: ALTURA,
	calculateMetadata: detectarArquivos,
};

export const Root: React.FC = () => (
	<>
		<Composition id="Engrenza" {...comum} defaultProps={{tema: 'engrenza', temHook: false, temMusica: false}} />
		<Composition id="Original" {...comum} defaultProps={{tema: 'original', temHook: false, temMusica: false}} />
	</>
);
