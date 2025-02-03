import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import dotenv from 'dotenv';
import { readFile } from 'fs/promises';

dotenv.config();

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin());

const listPath = './list.json';
let list;

(async () => {
  try {
    // JSON dosyasını okuma
    list = JSON.parse(await readFile(listPath, 'utf-8'));
    console.log(`Using list from ${listPath}`);
  } catch (error) {
    console.error(`Failed to read list from ${listPath} - ${error.message}`);
    return;
  }

  // 25 proxy için paralel tarayıcıları başlatma
  const browserPromises = list.slice(25,50).map(async (proxy, index) => {
    const browser = await puppeteer.launch({
      headless: false,
      userDataDir: proxy.userDataDir, // Kullanıcı verilerini saklamak için
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        `--proxy-server=${proxy.protocol}://${proxy.ip}:${proxy.port}`
    ]    
    });

    const page = await browser.newPage();

    if (proxy.username && proxy.password) {
      await page.authenticate({ username: proxy.username, password: proxy.password });
    }

    try {
      console.log(`Navigating to YouTube for Proxy ${index + 1}`);
      await page.goto('https://www.youtube.com/watch?v=3phA-xfidz0', { waitUntil: 'networkidle2', timeout: 100000 });
    } catch (error) {
      console.error(`Error during execution for Proxy ${index + 1}:`, error.message);
    }

    return browser; // Tarayıcıyı döndürüyoruz, böylece tarayıcıyı kontrol edebiliriz
  });

  // Tüm tarayıcıları başlat
  const browsers = await Promise.all(browserPromises);

  // 1 saat boyunca çalışacak bir zamanlayıcı ayarla (3600 saniye = 3.600.000 ms)
  setTimeout(async () => {
    console.log("1 hour has passed. Closing all browsers...");
    
    // Tarayıcıları kapat
    for (const browser of browsers) {
      await browser.close();
    }

    console.log("All browsers have been closed.");
  }, 3600000); // 1 saat
})();
