const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', error => console.error('BROWSER ERROR:', error.message));
  page.on('requestfailed', request => console.error('REQUEST FAILED:', request.url(), request.failure().errorText));
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  const html = await page.evaluate(() => document.getElementById('root').innerHTML);
  console.log('ROOT HTML:', html);
  await browser.close();
})();
