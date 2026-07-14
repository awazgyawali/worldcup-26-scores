import { readFileSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const serviceAccount = JSON.parse(
  readFileSync(new URL("./serviceAccountKey.json", import.meta.url))
);

initializeApp({
  credential: cert(serviceAccount),
});

const auth = getAuth();
const firestore = getFirestore();

async function main() {


  // merge VDFGxz0I7zZQZenYvhUFBXHuHHn2 uid to N3A0OEfdVBV1cMNc2t45Z4wx1pY2

  const predictions = await firestore.collection("predictions").get();
  // write to file
  fs.writeFileSync("predictions.json", JSON.stringify(predictions.docs.map(doc => doc.data()), null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });