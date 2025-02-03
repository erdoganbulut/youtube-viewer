import puppeteer from 'puppeteer-extra';
import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import { DEFAULT_INTERCEPT_RESOLUTION_PRIORITY } from 'puppeteer';

const stealth = StealthPlugin();
stealth.enabledEvasions.delete('iframe.contentWindow');
stealth.enabledEvasions.delete('media.codecs');

puppeteer.use(
  AdblockerPlugin({
    interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
  })
);
puppeteer.use(stealth);

const csvFilePath = './data.csv';
const testUrl = 'https://kick.com/reatsy';
const screenshotsDir = './screenshots';

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

async function openBrowserWithProxy(proxy) {
  let browser;
  console.log('burada')
  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        `--proxy-server=${proxy.protocol}://${proxy.ip}:${proxy.port}`,
      ],
    });

    const page = await browser.newPage();

    if (proxy.username && proxy.password) {
      await page.authenticate({ username: proxy.username, password: proxy.password });
    }

    console.log(`Navigating to Kick.com with proxy ${proxy.ip}:${proxy.port}`);
    await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log(`Waiting on Kick.com for 5 minutes with proxy ${proxy.ip}:${proxy.port}`);
    await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));

    await page.screenshot({ path: path.join(screenshotsDir, `${proxy.ip}_${proxy.port}_kick.png`) });
    console.log(`Screenshot saved for proxy ${proxy.ip}:${proxy.port}`);

    await browser.close();
  } catch (error) {
    console.error(`Error occurred with proxy ${proxy.ip}:${proxy.port}: ${error.message}`);
    if (browser) {
      await browser.close();
    }
  }
}

async function main() {
  let proxyList = [];

  try {
    proxyList = await readCSV(csvFilePath);
  } catch (error) {
    console.error('Error reading proxy list:', error);
    return;
  }

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  const proxyPromises = proxyList.map((proxy) => openBrowserWithProxy(proxy));

  await Promise.all(proxyPromises);
  console.log('All browsers have completed their tasks.');
}

main();