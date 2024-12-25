import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import dotenv from 'dotenv';

dotenv.config();

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: false, // Tarayıcıyı görünür yapmak için false
    userDataDir: './user_data12', // Kullanıcı verilerini saklamak için
  });

  const page = await browser.newPage();

  try {
    console.log('Navigating to YouTube');
    await page.goto('https://youtube.com/', { waitUntil: 'networkidle2', timeout: 100000 });


  } catch (error) {
    console.error('Error during execution:', error.message);
  } finally {
    // await browser.close(); // Tarayıcıyı her durumda kapat
  }
})();
