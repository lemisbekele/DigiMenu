import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3003';
const OUTPUT_DIR = path.resolve('c:/Users/ebawa/OneDrive/Desktop/Cafe/public/assets/screenshots');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function run() {
  console.log(`Launching browser using: ${CHROME_PATH}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();

  async function loginAs(email, password, isSuperAdmin = false) {
    const loginUrl = isSuperAdmin ? `${BASE_URL}/superadmin/login` : `${BASE_URL}/lemi-coffee/login`;
    console.log(`Logging in as ${email} at ${loginUrl}...`);
    await page.goto(loginUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    await page.$eval('input[type="email"]', el => el.value = '');
    await page.type('input[type="email"]', email);
    
    await page.$eval('input[type="password"]', el => el.value = '');
    await page.type('input[type="password"]', password);
    
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    }
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
  }

  try {
    // 1. Customer Digital Menu (Mobile Viewport)
    console.log('Capturing Customer Menu (Mobile)...');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(`${BASE_URL}/lemi-coffee/menu`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'customer_menu_mobile.png'),
      fullPage: false
    });
    console.log('✓ Captured customer_menu_mobile.png');

    // 2. Admin Login & Operations Dashboard (Desktop Viewport)
    console.log('Capturing Operations Dashboard...');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false });
    await loginAs('admin@lemi.test', 'Password1!');
    await page.goto(`${BASE_URL}/lemi-coffee/dashboard`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'operations_dashboard.png'),
      fullPage: false
    });
    console.log('✓ Captured operations_dashboard.png');

    // 3. Admin Menu Management
    console.log('Capturing Admin Menu Management...');
    await page.goto(`${BASE_URL}/lemi-coffee/admin/menu`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'admin_menu.png'),
      fullPage: false
    });
    console.log('✓ Captured admin_menu.png');

    // 4. Admin Tables & QR Codes
    console.log('Capturing Table QR Management...');
    await page.goto(`${BASE_URL}/lemi-coffee/tables`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'admin_tables.png'),
      fullPage: false
    });
    console.log('✓ Captured admin_tables.png');

    // 5. Admin Orders Management
    console.log('Capturing Admin Orders...');
    await page.goto(`${BASE_URL}/lemi-coffee/orders`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'admin_orders.png'),
      fullPage: false
    });
    console.log('✓ Captured admin_orders.png');

    // 6. Kitchen Display System (Barista)
    console.log('Logging out and capturing Kitchen KDS...');
    await page.evaluate(() => localStorage.clear());
    await loginAs('barista@lemi.test', 'Password1!');
    await page.goto(`${BASE_URL}/lemi-coffee/kds`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'kitchen_kds.png'),
      fullPage: false
    });
    console.log('✓ Captured kitchen_kds.png');

    // 7. Cashier POS (Cashier)
    console.log('Logging out and capturing Cashier POS...');
    await page.evaluate(() => localStorage.clear());
    await loginAs('cashier@lemi.test', 'Password1!');
    await page.goto(`${BASE_URL}/lemi-coffee/pos`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'cashier_pos.png'),
      fullPage: false
    });
    console.log('✓ Captured cashier_pos.png');

    // 8. SuperAdmin Dashboard
    console.log('Logging out and capturing SuperAdmin Dashboard...');
    await page.evaluate(() => localStorage.clear());
    await loginAs('superadmin@lemi.test', 'Password1!', true);
    await page.goto(`${BASE_URL}/superadmin/dashboard`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'superadmin_dashboard.png'),
      fullPage: false
    });
    console.log('✓ Captured superadmin_dashboard.png');

    console.log('SUCCESS: All real screenshots captured!');
  } catch (err) {
    console.error('Error during screenshot capture:', err);
  } finally {
    await browser.close();
  }
}

run();
