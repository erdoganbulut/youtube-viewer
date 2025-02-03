import puppeteer from 'puppeteer-extra';
import fs from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import dotenv from 'dotenv';

dotenv.config();

const stealth = StealthPlugin();
stealth.enabledEvasions.delete('iframe.contentWindow');
stealth.enabledEvasions.delete('media.codecs');

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin());

const listPath = './list2.json';
const screenshotsDir = './screenshots';
const MAX_CONCURRENT_BROWSERS = 27;

async function processProxy(proxy, index) {
  let browser;
  let page;
  
  try {
    console.log(`Starting browser ${index + 1} with proxy ${proxy.ip}:${proxy.port}`);
    
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      userDataDir: proxy.userDataDir,
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
      console.log(`Browser ${index + 1}: Logging in to Google account...`);
      await loginToGoogle(page, proxy);
    }

    console.log(`Browser ${index + 1}: Navigating to YouTube`);
    await page.goto('https://www.youtube.com', { waitUntil: 'networkidle2', timeout: 100000 });
    await page.screenshot({ path: path.join(proxyDir, 'step1_youtube_home.png') });
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log(`Browser ${index + 1}: Searching for "Merter Zorlu"`);
    const searchBar = await page.waitForSelector('.ytSearchboxComponentInput');
    await searchBar.click();
    await searchBar.type('Merter Zorlu');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const button = await page.waitForSelector('.ytSearchboxComponentSearchButton');
    await button.click();
    await new Promise(resolve => setTimeout(resolve, 5000));
    await page.screenshot({ path: path.join(proxyDir, 'step2_search_results.png') });

    console.log(`Browser ${index + 1}: Clicking on the channel name`);
    const channelLinks = await page.$$('ytd-search div#container.ytd-channel-name a');
    await channelLinks[1].click();
    await new Promise(resolve => setTimeout(resolve, 5000));
    await page.screenshot({ path: path.join(proxyDir, 'step3_channel_page.png') });
    
    console.log('Clicking on the Videos tab');
    const videosTab = await page.waitForSelector('yt-tab-shape:nth-child(4)');
    await videosTab.click();
    await new Promise(resolve => setTimeout(resolve, 3000));
    await page.waitForSelector('iron-selector yt-chip-cloud-chip-renderer');
    

    const firstVisibleVideos = await page.$$('ytd-thumbnail.ytd-rich-grid-media');
    let firstVisibleVideo = null;
    for (const element of firstVisibleVideos) {
      const isVisible = await element.isVisible();
      if (!firstVisibleVideo && isVisible) {
        firstVisibleVideo = element;
        break;
      }
    }

    console.log(`Browser ${index + 1}: Clicking on first video`);
    await firstVisibleVideo.click();
    await new Promise(resolve => setTimeout(resolve, 50000));
    await page.screenshot({ path: path.join(proxyDir, 'step4_video_page.png') });

    return browser; // Tarayıcıyı döndür

  } catch (error) {
    console.error(`Error in browser ${index + 1} with proxy ${proxy.ip}:${proxy.port}:`, error.message);
    const errorScreenshotPath = path.join(screenshotsDir, `${proxy.ip}_${proxy.port}`, 'error_screenshot.png');
    const errorDomContentPath = path.join(screenshotsDir, `${proxy.ip}_${proxy.port}`, 'error_domContent.html');
    
    try {
      if (page) {
        await page.screenshot({ path: errorScreenshotPath });
        const errorDomContent = await page.content();
        await fs.promises.writeFile(errorDomContentPath, errorDomContent);
      }
    } catch (screenshotError) {
      console.error(`Failed to save error data for browser ${index + 1}:`, screenshotError.message);
    }
    if (browser) return browser;
  }
}

async function isLoggedIn(page) {
  try {
    console.log('Checking if logged in to YouTube');
    await page.goto('https://www.youtube.com', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 5000));
    const profileIconSelector = '#avatar-btn';
    const isLoggedIn = await page.$(profileIconSelector) !== null;
    if (isLoggedIn) {
      console.log('Already logged in to YouTube.');
      return true;
    }
    console.log('Not logged in to YouTube.');
    return false;
  } catch (error) {
    console.error('Error during login check:', error.message);
    return false;
  }
}

async function loginToGoogle(page, proxy) {
  try {
    console.log('Navigating to Google login page');
    await page.goto('https://accounts.google.com/signin', { waitUntil: 'networkidle2', timeout: 100000 });

    const emailSelector = 'input[type="email"]';
    await page.waitForSelector(emailSelector);
    console.log(`${proxy.mail}`);
    await page.type(emailSelector, `${proxy.mail}`);
    await page.click('#identifierNext');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const passwordSelector = 'input[type="password"]';
    await page.waitForSelector(passwordSelector);
    await page.type(passwordSelector, `${proxy.mailpassword}`);
    await page.click('#passwordNext');
    await new Promise(resolve => setTimeout(resolve, 10000));

    if (await page.url().includes('accounts.google.com')) {
      throw new Error('Login failed. Please check your credentials.');
    }
    console.log('Successfully logged in to Google');
  } catch (error) {
    console.error('Error during Google login:', error.message);
    throw error;
  }
}


(async () => {
  let list;
  try {
    // JSON dosyasını okuma
    list = JSON.parse(await readFile(listPath, 'utf-8'));
    console.log(`Using list from ${listPath}`);
  } catch (error) {
    console.error(`Failed to read list from ${listPath} - ${error.message}`);
    return;
  }

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  // İlk 25 proxy için paralel işlem başlat
  const browserPromises = list.slice(25, MAX_CONCURRENT_BROWSERS).map(async (proxy, index) => {
    return await processProxy(proxy, index);
  });

  // Tüm tarayıcıları başlat
  const browsers = await Promise.all(browserPromises);

  // 1 saat sonra kapatma zamanlayıcısı
  setTimeout(async () => {
    console.log("1 hour has passed. Closing all browsers...");
    for (const browser of browsers) {
      if (browser) await browser.close();
    }
    console.log("All browsers have been closed.");
  }, 3600000); // 1 saat
})();