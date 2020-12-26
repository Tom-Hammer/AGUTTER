let throng = require('throng');
let Queue = require("bull");
const puppeteer = require('puppeteer');
const Datastore = require('nedb');
const database = new Datastore('database.db');
database.loadDatabase();


// Connect to a local redis instance locally, and the Heroku-provided URL in production
let REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// Spin up multiple processes to handle jobs to take advantage of more CPU cores
// See: https://devcenter.heroku.com/articles/node-concurrency for more info
let workers = process.env.WEB_CONCURRENCY || 2;

// The maximum number of jobs each worker should process at once. This will need
// to be tuned for your application. If each job is mostly waiting on network 
// responses it can be much higher. If each job is CPU-intensive, it might need
// to be much lower.
let maxJobsPerWorker = 50;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const URLs = [];
let usURL = [];
let auURL = [];

app.post('/url', (request, response) => {
  const json = request.body;
  URLs.push(...json);
  usURL = URLs.filter(text => text.match('cbp.gov'));
  auURL = URLs.filter(text => text.match('abf.gov'));
  console.log(usURL);
  console.log(auURL);
});

// app.post('/getdata', (request, response) => {
//   console.log('gettingData');
//   getContentsAU();
//   getContentsUS();
// })

// async function getData(){
//   const getdata =  await Promise.all(getContentsUS(), getContentsAU())
// }

async function getContentsUS() {
  console.log(usURL[0])
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(usURL[0], {waitUntil: 'networkidle2'});
  const urls = await page.evaluate(() => {
    const nodeList = document.querySelectorAll('a.survey-processed[href*="-media-release"]'); // get only <a> elements that have the classname 'survey-processed' and whose 'href' attribute contains the phrase "media-release"
    return [...new Set(Array.from(nodeList).map(element => element.href))]; // convert the NodeList into an array and use 'map' to get the 'href' attributes
  });
  console.log(urls);

  for (const url of urls) {
    await page.goto(url, {waitUntil: 'networkidle2'});

    const contents = await page.evaluate(() => {
      newDate = new Date(document.getElementsByClassName('date-display-single')[0].textContent.replace(/,/g," "))
      const yyyy = newDate.getFullYear();
      const mm = newDate.getMonth() + 1 ;
      const dd = newDate.getDate();
      return {
        country: "US",
        title: document.getElementsByClassName('title')[0].textContent.replace(/\n/g," ").replace(/,/g, " "),
        date: `${yyyy}/${mm}/${dd}`,
        fieldItem: Array.from(document.querySelectorAll('.field-items .even p')).map(text => text.innerText).slice(0, -1).join(" ").replace(/\n/g," ").replace(/,/g, " "),
        imageSrc: Array.from(document.querySelectorAll('.image img[src]')).map(img => img.currentSrc),
        imageText: Array.from(document.querySelectorAll('.image figcaption')).map(text => text.innerText.replace(/\n/g," ").replace(/,/g, " ")).join(" "),
        URL: location.href
      };
    });
    // console.log(contents);
    database.insert(contents);
  }
  await browser.close();
};

async function getContentsAU() {
  console.log(auURL[0]);
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(auURL[0], {waitUntil: 'networkidle2'});
  const urls = await page.evaluate(() => {
    const nodeList = document.querySelectorAll('a[href*="releases/"]'); // get only <a> elements that have the classname 'survey-processed' and whose 'href' attribute contains the phrase "media-release"
    return [...new Set(Array.from(nodeList).map(element => element.href))]; // convert the NodeList into an array and use 'map' to get the 'href' attributes
  });
  console.log(urls);

  for (const url of urls) {
    await page.goto(url, {waitUntil: 'networkidle2'});

    const contents = await page.evaluate(() => {
      const ddmmyyyy = document.getElementsByClassName('pub-date')[0].innerText;
      const yyyy = ddmmyyyy.split('-')[2].replace(" ", "");
      const mm = ddmmyyyy.split('-')[1];
      const dd = ddmmyyyy.split('-')[0];
      return {
        country: "AU",
        title: Array.from(document.querySelectorAll('#release-title')).map(text => text.innerText.replace(/\n/g," ").replace(/,/g, " ")),
        date: `${yyyy}/${mm}/${dd}`,
        fieldItem: Array.from(document.querySelectorAll('.body p')).map(text => text.innerText).join(" ").replace(/\n/g," ").replace(/,/g, " ").replace(/More →/g, " "),
        imageSrc: Array.from(document.querySelectorAll('img[src*=".jpg"]')).map(img => img.currentSrc).slice(0, 2),
        imageText: Array.from(document.querySelectorAll('p.caption')).map(text => text.innerText).slice(0, 2).join(" ").replace(/\n/g," ").replace(/,/g, " ").replace(/More →/g, " "),
        URL: location.href
      };
    });
    // console.log(contents);
    database.insert(contents);
  }
  await browser.close();
};

function start() {
  // Connect to the named work queue
  let workQueue = new Queue('work', REDIS_URL);

  workQueue.process(maxJobsPerWorker, async (job) => {
    // This is an example job that just slowly reports on progress
    // while doing no work. Replace this with your own job logic.
    const dataAU = await getContentsAU();
    const dataUS = await getContentsUS();


    // A job can return values that will be stored in Redis as JSON
    // This return value is unused in this demo application.
    return { value: "This will be stored" };
  });
}

// Initialize the clustered worker process
// See: https://devcenter.heroku.com/articles/node-concurrency for more info
throng({ workers, start });
