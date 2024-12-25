import puppeteer from 'puppeteer-extra';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import csv from 'csv-parser';
import path from 'path';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import { DEFAULT_INTERCEPT_RESOLUTION_PRIORITY } from 'puppeteer';

const stealth = StealthPlugin()
stealth.enabledEvasions.delete('iframe.contentWindow')
stealth.enabledEvasions.delete('media.codecs')
stealth.enabledEvasions.delete('navigator.plugins'); // Tarayıcı eklentilerini simüle etme


puppeteer.use(
  AdblockerPlugin({
    // Optionally enable Cooperative Mode for several request interceptors
    interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY
  })
)
puppeteer.use(stealth)

const csvFilePath = './data.csv';
const whitelistPath = './whitelist.json';
const testUrl = 'https://httpbin.org/get';
const screenshotsDir = './screenshots';

const userDataDir = './user_data'; // Kullanıcı verilerinin kaydedileceği dizin

async function readCSV(filePath) {
  const proxies = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv({ headers: false }))
      .on('data', (row) => {
        const [ip, port, username, password] = row[0].split(':');
        proxies.push({ ip, port, username, password, protocol: 'http' });
      })
      .on('end', () => resolve(proxies))
      .on('error', (error) => reject(error));
  });
}

async function checkProxy(ip, port, protocol, username, password) {
  try {
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        `--proxy-server=${protocol}://${ip}:${port}`
      ],
    });
    const page = await browser.newPage();

    if (username && password) {
      await page.authenticate({ username, password });
    }

    await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 10000 });
    await browser.close();
    console.log(`Proxy check passed for ${ip}:${port}`);
    return true;
  } catch (error) {
    console.error(`Proxy check failed for ${ip}:${port} - ${error.message}`);
    return false;
  }
}

async function main() {
  const useWhitelist = process.argv.includes('--whitelist');
  let whitelist = [];

  if (useWhitelist) {
    try {
      whitelist = JSON.parse(await fsPromises.readFile(whitelistPath, 'utf-8'));
      console.log(`Using whitelist from ${whitelistPath}`);
    } catch (error) {
      console.error(`Failed to read whitelist from ${whitelistPath} - ${error.message}`);
      return;
    }
  } else {
    try {
      const proxyList = await readCSV(csvFilePath);
      for (const proxy of proxyList) {
        const isWorking = await checkProxy(proxy.ip, proxy.port, proxy.protocol, proxy.username, proxy.password);
        if (isWorking) {
          whitelist.push(proxy);
        }
      }
      await fsPromises.writeFile(whitelistPath, JSON.stringify(whitelist, null, 2));
      console.log(`Whitelist saved to ${whitelistPath}`);
    } catch (error) {
      console.error('Error:', error);
      return;
    }
  }

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  const proxy = whitelist[0];
  let browser;
  let page;

  const targetUrl = 'https://www.coinkolik.com/kyk-bursuyla-baslayan-bitcoin-seruveni-ranzerfin-kripto-yolculugu/';
  const youtubeIframeSelector = 'iframe';

  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      userDataDir, // Kullanıcı veri dizini
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        `--proxy-server=${proxy.protocol}://${proxy.ip}:${proxy.port}`
      ],
    });
    page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36');
    const cookies = [
        {
          name: 'CONSENT',
          value: 'YES+cb.20210328-17-p0.en+FX+294', // YouTube'un coğrafi onay çerezi
          domain: '.youtube.com',
        },
      ];
      
      await page.setCookie(...cookies);

    if (proxy.username && proxy.password) {
      await page.authenticate({ username: proxy.username, password: proxy.password });
    }

    const proxyDir = path.join(screenshotsDir, `${proxy.ip}_${proxy.port}`);
    if (!fs.existsSync(proxyDir)) {
      fs.mkdirSync(proxyDir);
    }

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    console.log('Waiting for page to load...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Sayfanın tam yüklenmesi için bekleyelim

    console.log('Locating YouTube iframe...');
    await page.waitForSelector(youtubeIframeSelector, { timeout: 10000 });
    const iframeHandle = await page.$(youtubeIframeSelector);

    if (!iframeHandle) {
      throw new Error('YouTube iframe not found!');
    }

    console.log('Switching to YouTube iframe...');
    const iframe = await iframeHandle.contentFrame();

    if (!iframe) {
      throw new Error('Failed to access iframe content!');
    }

    const playButtonSelector = '.ytp-large-play-button';
    console.log('Waiting for play button...');
    await iframe.waitForSelector(playButtonSelector, { timeout: 10000 });

    console.log('Clicking the play button...');
    await iframe.click(playButtonSelector);

    console.log('YouTube video started playing.');
    // Videoyu bir süre oynatmak için bekleyelim
    await new Promise(resolve => setTimeout(resolve, 10000));

    await browser.close();
  } catch (error) {
    console.error(`Request failed for ${proxy.ip}:${proxy.port} - ${error.message}`);
    const errorScreenshotPath = path.join(screenshotsDir, `${proxy.ip}_${proxy.port}`, 'error_screenshot.png');
    const errorDomContentPath = path.join(screenshotsDir, `${proxy.ip}_${proxy.port}`, 'error_domContent.html');
    try {
      if (page) {
        await page.screenshot({ path: errorScreenshotPath });
        const errorDomContent = await page.content();
        await fsPromises.writeFile(errorDomContentPath, errorDomContent);
        console.log(`Error screenshot and DOM content saved for ${proxy.ip}:${proxy.port}`);
      }
    } catch (screenshotError) {
      console.error(`Failed to save error screenshot and DOM content for ${proxy.ip}:${proxy.port} - ${screenshotError.message}`);
    }
    if (browser) {
      await browser.close();
    }
  }
}

main();
