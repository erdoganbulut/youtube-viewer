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

async function clickOldestButton(page) {
  const selector = 'iron-selector yt-chip-cloud-chip-renderer'; // Hedef öğe seçicisi
  const targetText = 'Oldest'; // Aradığımız metin

  try {
    // Öğeleri al ve "Oldest" metnini içeren öğeyi seç
    const buttonFound = await page.evaluate((selector, targetText) => {
      const elements = Array.from(document.querySelectorAll(selector));
      const targetElement = elements.find((element) => {
        const rect = element.getBoundingClientRect();
        const isVisible =
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth);
        return isVisible && element.textContent.trim() === targetText;
      });
      if (targetElement) {
        targetElement.click(); // Öğeye tıklama
        return true;
      }
      return false;
    }, selector, targetText);

    if (buttonFound) {
      console.log(`Clicked on the "${targetText}" button.`);
    } else {
      console.log(`"${targetText}" button not found or not visible.`);
    }
  } catch (error) {
    console.error('Error while clicking the "Oldest" button:', error.message);
  }
}


async function isLoggedIn(page) {
  try {
    console.log('Checking if logged in to YouTube');
    await page.goto('https://www.youtube.com', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 5000));
    const profileIconSelector = '#avatar-btn';
    const isLoggedIn = await page.$(profileIconSelector) !== null; // Profil simgesi varsa giriş yapılmış
    if (isLoggedIn) {
      console.log('You are already logged in to YouTube.');
      return true;
    }
    console.log('Not logged in to YouTube.');
    return false;
  } catch (error) {
    console.error('Error during login check:', error.message);
    return false;
  }
}

async function loginToGoogle(page) {
  try {
    console.log('Navigating to Google login page');
    await page.goto('https://accounts.google.com/signin', { waitUntil: 'networkidle2', timeout: 100000 });

    // Enter email/username
    const emailSelector = 'input[type="email"]';
    await page.waitForSelector(emailSelector);
    await page.type(emailSelector, 'tongucbakioglu@gmail.com'); // Replace with your email
    await page.click('#identifierNext');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Enter password
    const passwordSelector = 'input[type="password"]';
    await page.waitForSelector(passwordSelector);
    await page.type(passwordSelector, 'Erdogan-1996'); // Replace with your password
    await page.click('#passwordNext');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check if login was successful
    if (await page.url().includes('accounts.google.com')) {
      throw new Error('Login failed. Please check your credentials.');
    }
    console.log('Successfully logged in to Google');
  } catch (error) {
    console.error('Error during Google login:', error.message);
    throw error;
  }
}

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

    if (proxy.username && proxy.password) {
      await page.authenticate({ username: proxy.username, password: proxy.password });
    }

    const proxyDir = path.join(screenshotsDir, `${proxy.ip}_${proxy.port}`);
    if (!fs.existsSync(proxyDir)) {
      fs.mkdirSync(proxyDir);
    }

    const isLoggedInToYouTube = await isLoggedIn(page);
    if (!isLoggedInToYouTube) {
      console.log('Logging in to Google account...');
      await loginToGoogle(page);
    }

    console.log('Navigating to YouTube');
    await page.goto('https://www.youtube.com', { waitUntil: 'networkidle2', timeout: 100000 });
    console.log('Waiting for YouTube to load1');
    await page.screenshot({ path: path.join(proxyDir, 'step1_youtube_home.png') });
    console.log('Waiting for YouTube to load2');
    await new Promise(resolve => setTimeout(resolve, 10000));
    console.log('Waiting for YouTube to load3');

    console.log('Searching for "Merter Zorlu"');
    const searchBar = await page.waitForSelector('.YtSearchboxComponentInput');
    console.log('searchBar', searchBar);
    // await searchBar.click();
    await searchBar.type('Merter Zorlu');
    await new Promise(resolve => setTimeout(resolve, 5000));
    // const button = await page.waitForSelector('#search-icon-legacy');
    const button = await page.waitForSelector('.YtSearchboxComponentSearchButton');
    console.log('button', button);
    await button.click();
    await new Promise(resolve => setTimeout(resolve, 5000));
    await page.screenshot({ path: path.join(proxyDir, 'step2_search_results.png') });

    console.log('Clicking on the channel name');
    const channelLinks = await page.$$('ytd-search div#container.ytd-channel-name a');
    await channelLinks[1].click();
    await new Promise(resolve => setTimeout(resolve, 5000));
    await page.screenshot({ path: path.join(proxyDir, 'step3_channel_page.png') });

    console.log('Clicking on the Videos tab');
    const videosTab = await page.waitForSelector('yt-tab-group-shape yt-tab-shape[tab-title="Videos"]');
    await videosTab.click();
    await new Promise(resolve => setTimeout(resolve, 3000));
    await page.waitForSelector('iron-selector yt-chip-cloud-chip-renderer');
    console.log('targetButton');
    await clickOldestButton(page);
    console.log('Waiting for YouTube to load4');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('Waiting for YouTube to load5');

    const firstVisibleVideos = await page.$$('ytd-thumbnail');
    let firstVisibleVideo = null;
    for (const element of firstVisibleVideos) {
      const isVisible = await element.isVisible();
      if (!firstVisibleVideo && isVisible) {
        firstVisibleVideo = element;
      }
    }
    console.log('firstVisibleVideo', firstVisibleVideo);
    console.log('Waiting for YouTube to load6');
    await firstVisibleVideo.click();
    console.log('Waiting for YouTube to load7');
    await new Promise(resolve => setTimeout(resolve, 50000));
    console.log('Waiting for YouTube to load8');
    await page.screenshot({ path: path.join(proxyDir, 'step4_video_page.png') });
    console.log('Waiting for YouTube to load9');

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
