import fs from 'node:fs';
import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('png');
Config.setCodec('h264');
Config.setCrf(18);

// Neste ambiente o Chromium já vem instalado; na sua máquina o Remotion baixa o dele.
const localChrome = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
if (fs.existsSync(localChrome)) {
	Config.setBrowserExecutable(localChrome);
}
