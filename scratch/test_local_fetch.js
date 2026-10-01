const fs = require("fs");
const path = require("path");

async function testFetch() {
  try {
    const res = await fetch("http://localhost:3000/api/upload/blob-files?folder=PQ");
    // We can't fetch localhost if the server isn't running locally.
    console.log(res.status);
  } catch (e) {
    console.error(e);
  }
}
testFetch();
