const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening at ${port}`)
});
app.use(express.static('public'));
app.use(express.json({ limit: '1mb' }));

const puppeteer = require('puppeteer');
const Datastore = require('nedb');
const {
  response, text, request
} = require('express');
require('dotenv').config();
const stringifySync = require("csv-stringify/lib/sync");
const fs = require("fs");
const database = new Datastore('database.db');
database.loadDatabase();





// Attach click handlers and kick off background processes
// window.onload = function() {
//   document.querySelector("submit").addEventListener("click", console.log("2"));
  // document.querySelector("#clear").addEventListener("click", clear);

  // setInterval(updateJobs, 200);
// };

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

app.post('/getdata', (request, response) => {
  console.log('gettingData');
  getContentsAU();
  getContentsUS();
})

// async function getData(){
//   const getdata =  await Promise.all(getContentsUS(), getContentsAU())
// }

// getContentsUS();
async function getContentsUS() {
  console.log(usURL[0])
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"]
  });
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


// getContentsAU();
async function getContentsAU() {
  console.log(auURL[0]);
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"]
  });
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


app.get('/api', (request, response) => {
  database.find({}).exec(function(err, data){
    if (err) {
      response.end();
      return;
    }
    response.json(data);
  })
});