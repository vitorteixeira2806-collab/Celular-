import React from 'react';
import {AbsoluteFill} from 'remotion';
import {TEXTO_CENTRO_Y, type Tema} from './config';
import type {Cartela as Dados} from './layout';

const ENTRELINHA = 0.98;

export const Cartela: React.FC<{
	tema: Tema;
	dados: Dados;
	clara: boolean;
	ultima: boolean;
}> = ({tema, dados, clara, ultima}) => {
	const fundo = clara ? tema.claro : tema.escuro;
	const cor = clara ? tema.escuro : tema.claro;
	const altura = dados.linhas.length * dados.tamanho * ENTRELINHA;

	return (
		<AbsoluteFill style={{backgroundColor: fundo}}>
			<div
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: TEXTO_CENTRO_Y - altura / 2,
					fontFamily: `'${tema.fonte.familia}'`,
					fontWeight: tema.fonte.peso,
					fontSize: dados.tamanho,
					letterSpacing: tema.fonte.espacamento,
					lineHeight: ENTRELINHA,
					color: cor,
					textAlign: 'center',
					whiteSpace: 'pre',
				}}
			>
				{dados.linhas.map((linha, i) => {
					const final = ultima && tema.pontoFinal && i === dados.linhas.length - 1;
					const pont = final && /[.?!]$/.test(linha) ? linha.slice(-1) : '';
					return (
						<div key={i}>
							{pont ? linha.slice(0, -1) : linha}
							{pont ? <span style={{color: tema.pontoFinal!}}>{pont}</span> : null}
						</div>
					);
				})}
			</div>
		</AbsoluteFill>
	);
};
