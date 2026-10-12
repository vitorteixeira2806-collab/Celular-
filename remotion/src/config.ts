// ============================================================================
//  TUDO O QUE VOCÊ PRECISA EDITAR ESTÁ AQUI.
// ============================================================================

// Textos das cartelas, na ordem em que aparecem.
// Palavras soltas ("moderno.") ficam todas no mesmo tamanho grande.
// Frases longas quebram em duas linhas sozinhas; para forçar a quebra, use "\n".
export const TEXTOS = [
	'precisa de um site?',
	'moderno.',
	'rápido.',
	'achado no google.',
	'chama no direct.',
];

// Tempos medidos no vídeo original, convertidos em frames a 30 fps.
// Cortes do original: 2,133s / 2,933s / 3,800s / 4,633s / 5,500s / 7,167s (volta ao início).
export const FPS = 30;
export const GANCHO_FRAMES = 64; // 0,000s → 2,133s: bolinha
export const CARTELAS_FRAMES = [24, 26, 25, 26, 50]; // uma duração por texto acima
export const TOTAL_FRAMES =
	GANCHO_FRAMES + CARTELAS_FRAMES.reduce((a, b) => a + b, 0); // 215 = 7,167s

export const LARGURA = 1080;
export const ALTURA = 1920;

// Arquivos opcionais em remotion/public/
//   hook.mp4  → sua bolinha filmada no celular (usa os primeiros 2,133s a partir de HOOK_INICIO_S)
//   music.mp3 → trilha (usa 7,167s a partir de MUSICA_INICIO_S)
export const HOOK_INICIO_S = 0;
export const HOOK_COM_SOM = false; // true = mantém o som ambiente do hook.mp4
export const MUSICA_INICIO_S = 0;
export const MUSICA_VOLUME = 1;

// ----------------------------------------------------------------------------
//  Paletas
// ----------------------------------------------------------------------------
export type Tema = {
	nome: string;
	fonte: {familia: string; arquivo: string; peso: number; espacamento: string};
	escuro: string; // fundo das cartelas escuras / texto das claras
	claro: string; // fundo das cartelas claras / texto das escuras
	pontoFinal: string | null; // cor do ponto final da ÚLTIMA cartela (null = mesma cor do texto)
	cena: {chao: string; chaoLinha: string; bancada: string; bancadaBorda: string; bola: string};
};

export const ENGRENZA: Tema = {
	nome: 'Engrenza',
	fonte: {
		familia: 'Space Grotesk Engrenza',
		arquivo: 'fonts/SpaceGrotesk-Bold.ttf',
		peso: 700,
		espacamento: '-0.035em',
	},
	escuro: '#080B10',
	claro: '#ECEFF3', // off-white
	pontoFinal: '#48A4EC', // azul conferido no PNG oficial do logo — revise com o manual da marca
	cena: {
		chao: '#080B10',
		chaoLinha: '#10151D',
		bancada: '#2A3240',
		bancadaBorda: '#171C25',
		bola: '#FFFFFF',
	},
};

// Cores estimadas da gravação de tela do original (HDR convertido para SDR).
export const ORIGINAL_VERDE: Tema = {
	nome: 'Original',
	fonte: {
		familia: 'Inter Tight Original',
		arquivo: 'fonts/InterTight-Bold.woff2',
		peso: 700,
		espacamento: '-0.03em',
	},
	escuro: '#0E2E1F',
	claro: '#F3E8D8',
	pontoFinal: null,
	cena: {
		chao: '#7A5634',
		chaoLinha: '#6A4A2C',
		bancada: '#D8D3CB',
		bancadaBorda: '#9C968D',
		bola: '#FFFFFF',
	},
};

// ----------------------------------------------------------------------------
//  Layout (área segura do Reels: fora da coluna de botões e da legenda)
// ----------------------------------------------------------------------------
export const TEXTO_LARGURA_MAX = 940; // px úteis (margem de 70px de cada lado)
export const TEXTO_CENTRO_Y = 870; // centro vertical do texto (acima da coluna de botões)
export const TAMANHO_PALAVRA_MAX = 300; // teto do tamanho das palavras soltas
export const TAMANHO_FRASE_MAX = 150; // teto do tamanho da pergunta e do CTA
