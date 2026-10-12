import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {ALTURA, FPS, LARGURA, type Tema} from './config';

// Gancho provisório: bolinha jogada na bancada, quica, rola e cai pela borda,
// com o mesmo tempo do original (entra ~0,3s, cai da borda ~1,8s, corta em 2,133s).
// Substituído automaticamente por public/hook.mp4 quando ele existir.

// Bancada em perspectiva (vista de cima, câmera à direita)
const TL = [440, 150];
const TR = [1010, 175];
const BR = [920, 1660];
const BL = [345, 1590];
const ESPESSURA = [-34, 30];

const bordaX = (y: number) => TL[0] + ((BL[0] - TL[0]) * (y - TL[1])) / (BL[1] - TL[1]);

type P = {x: number; y: number};
const lerp = (a: P, b: P, u: number): P => ({x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u});
const clamp = (u: number) => Math.min(1, Math.max(0, u));

const ENTRA: P = {x: 1160, y: 640};
const Q1: P = {x: 930, y: 730};
const Q2: P = {x: 790, y: 850};
const Q3: P = {x: 725, y: 910};
const BORDA: P = {x: bordaX(1250) - 12, y: 1250};
const T = {entra: 0.3, q1: 0.48, q2: 0.8, q3: 0.96, borda: 1.8};
const G = 4600; // px/s², queda depois da borda

// posição no plano da bancada (x, y), altura acima dela (z) e se ainda está sobre ela
const bola = (t: number): {p: P; z: number; sobre: boolean} | null => {
	if (t < T.entra) return null;
	if (t < T.q1) {
		const u = (t - T.entra) / (T.q1 - T.entra);
		return {p: lerp(ENTRA, Q1, u), z: 320 * (1 - u * u), sobre: true};
	}
	if (t < T.q2) {
		const u = (t - T.q1) / (T.q2 - T.q1);
		return {p: lerp(Q1, Q2, u), z: 360 * u * (1 - u), sobre: true};
	}
	if (t < T.q3) {
		const u = (t - T.q2) / (T.q3 - T.q2);
		return {p: lerp(Q2, Q3, u), z: 88 * u * (1 - u), sobre: true};
	}
	const rolar = (u: number) => u * (1.25 - 0.25 * u); // desacelera de leve
	if (t < T.borda) {
		const u = (t - T.q3) / (T.borda - T.q3);
		return {p: lerp(Q3, BORDA, rolar(u)), z: 0, sobre: true};
	}
	const dt = t - T.borda;
	const k = 0.75 / (T.borda - T.q3); // velocidade no fim da rolagem
	const vx = (BORDA.x - Q3.x) * k;
	const vy = (BORDA.y - Q3.y) * k;
	return {p: {x: BORDA.x + vx * dt, y: BORDA.y + vy * dt + 0.5 * G * dt * dt}, z: 0, sobre: false};
};

const pontos = (...ps: number[][]) => ps.map((p) => p.join(',')).join(' ');
const soma = (a: number[], b: number[]) => [a[0] + b[0], a[1] + b[1]];

export const BolinhaProvisoria: React.FC<{tema: Tema}> = ({tema}) => {
	const frame = useCurrentFrame();
	const t = frame / FPS;
	const c = tema.cena;

	// câmera na mão
	const dx = 7 * Math.sin(t * 2.1) + 3 * Math.sin(t * 5.3 + 1);
	const dy = 5 * Math.sin(t * 1.7 + 2) + 2.5 * Math.sin(t * 6.1);
	const rot = 0.35 * Math.sin(t * 1.3 + 0.5);
	const zoom = 1.06 + 0.01 * t;

	const b = bola(t);
	const raio = b ? 58 * (0.85 + 0.3 * (b.p.y / ALTURA)) : 0;
	const cx = b ? b.p.x : 0;
	const cy = b ? b.p.y - raio * 0.55 - b.z : 0;
	// velocidade para um leve borrão de movimento
	const prox = bola(t + 1 / FPS);
	const vel = b && prox ? Math.hypot(prox.p.x - b.p.x, prox.p.y - prox.z - (b.p.y - b.z)) : 0;
	const ang = b && prox ? Math.atan2(prox.p.y - prox.z - (b.p.y - b.z), prox.p.x - b.p.x) : 0;
	const estica = 1 + Math.min(vel / 260, 0.35);

	const tabuas = Array.from({length: 14}, (_, i) => -300 + i * 110);

	return (
		<AbsoluteFill style={{backgroundColor: c.chao, overflow: 'hidden'}}>
			<AbsoluteFill
				style={{transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${zoom})`}}
			>
				<svg width={LARGURA} height={ALTURA} viewBox={`0 0 ${LARGURA} ${ALTURA}`}>
					<defs>
						<filter id="granito" x="0" y="0" width="100%" height="100%">
							<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
							<feColorMatrix
								values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.05"
							/>
						</filter>
						<clipPath id="tampo">
							<polygon points={pontos(TL, TR, BR, BL)} />
						</clipPath>
						<radialGradient id="esfera" cx="0.36" cy="0.32" r="0.75">
							<stop offset="0" stopColor={c.bola} />
							<stop offset="0.55" stopColor={c.bola} stopOpacity="0.96" />
							<stop offset="1" stopColor="#9AA0A8" />
						</radialGradient>
						<filter id="sombra" x="-50%" y="-50%" width="200%" height="200%">
							<feGaussianBlur stdDeviation="9" />
						</filter>
						<linearGradient id="luz" x1="0" y1="0" x2="1" y2="1">
							<stop offset="0" stopColor="#FFFFFF" stopOpacity="0.18" />
							<stop offset="1" stopColor="#000000" stopOpacity="0.22" />
						</linearGradient>
					</defs>

					{/* chão: tábuas em perspectiva */}
					{tabuas.map((x) => (
						<line
							key={x}
							x1={x}
							y1={-100}
							x2={x - 260}
							y2={ALTURA + 100}
							stroke={c.chaoLinha}
							strokeWidth={4}
						/>
					))}

					{/* bola caindo pela borda passa na frente da lateral da bancada */}
					<polygon
						points={pontos(TL, BL, soma(BL, ESPESSURA), soma(TL, [ESPESSURA[0], 10]))}
						fill={c.bancadaBorda}
					/>
					<polygon
						points={pontos(BL, BR, soma(BR, ESPESSURA), soma(BL, ESPESSURA))}
						fill={c.bancadaBorda}
						opacity={0.85}
					/>
					<polygon points={pontos(TL, TR, BR, BL)} fill={c.bancada} />
					<g clipPath="url(#tampo)">
						<rect width={LARGURA} height={ALTURA} filter="url(#granito)" opacity={0.18} />
						<rect width={LARGURA} height={ALTURA} fill="url(#luz)" />
					</g>

					{b && b.sobre ? (
						<ellipse
							cx={b.p.x + 14}
							cy={b.p.y + 4}
							rx={raio * 1.05 * (1 + b.z / 500)}
							ry={raio * 0.5 * (1 + b.z / 500)}
							fill="#000"
							opacity={0.42 * (1 - Math.min(b.z / 380, 0.75))}
							filter="url(#sombra)"
						/>
					) : null}

					{b ? (
						<g transform={`translate(${cx} ${cy}) rotate(${(ang * 180) / Math.PI}) scale(${estica} ${1 / Math.sqrt(estica)})`}>
							<circle r={raio} fill="url(#esfera)" />
						</g>
					) : null}
				</svg>
			</AbsoluteFill>
			{/* vinheta de lente */}
			<AbsoluteFill
				style={{
					background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35) 100%)',
				}}
			/>
		</AbsoluteFill>
	);
};
