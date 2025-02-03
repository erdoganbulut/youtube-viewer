import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import { DEFAULT_INTERCEPT_RESOLUTION_PRIORITY } from 'puppeteer';

const stealth = StealthPlugin();
stealth.enabledEvasions.delete('iframe.contentWindow');
stealth.enabledEvasions.delete('media.codecs');

puppeteer.use(
  AdblockerPlugin({
    interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY
  })
);
puppeteer.use(stealth);

const userDataDir = './user_data12/'; // Kullanıcı verilerinin kaydedileceği dizin

async function isLoggedIn(page) {
  try {
    console.log('Checking if logged in to YouTube');
    await page.goto('https://accounts.google.com/signin', { waitUntil: 'networkidle2', timeout: 100000 });
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

// Google hesabına giriş yapan fonksiyon
async function loginToGoogle(page) {
  try {
    console.log('Navigating to Google login page');
    await page.goto('https://accounts.google.com/signin', { waitUntil: 'networkidle2', timeout: 100000 });

    // Email veya kullanıcı adı girme
    const emailSelector = 'input[type="email"]';
    await page.waitForSelector(emailSelector);
    await page.type(emailSelector, 'sariyasin151@gmail.com'); // Email adresinizi buraya girin
    await page.click('#identifierNext');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Şifre girme
    const passwordSelector = 'input[type="password"]';
    await page.waitForSelector(passwordSelector);
    await page.type(passwordSelector, 'serpil38'); // Şifrenizi buraya girin
    await page.click('#passwordNext');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Giriş başarılı olup olmadığını kontrol etme
    if (await page.url().includes('accounts.google.com')) {
      throw new Error('Login failed. Please check your credentials.');
    }
    console.log('Successfully logged in to Google');
  } catch (error) {
    console.error('Error during Google login:', error.message);
    throw error;
  }
}

// Tarayıcı başlatma ve işlem akışını başlatma
(async () => {
  const browser = await puppeteer.launch({
    headless: false, // Tarayıcıyı görsel olarak görmek için false yapın
    userDataDir, // Verilerin kaydedileceği dizin
    args: ['--start-maximized',
           '--no-sandbox',  // Bu satırı ekleyin
           '--disable-setuid-sandbox'
    ]
     // Tarayıcıyı tam ekran başlat
  }); 

  const page = await browser.newPage();
  
  // Giriş kontrolü
  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) {
    await loginToGoogle(page);
  }

  // Tarayıcıyı kapatmadan önce bekleyin
 
   await new Promise(resolve => setTimeout(resolve, 5000));
    await browser.close();
})();