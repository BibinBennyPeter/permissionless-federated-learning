const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ethers, sha256 } = require("ethers");
const bodyParser = require("body-parser");
const upload = multer({ dest: "tmp/uploads" });

const app = express();
app.use(bodyParser.json());

const ARTIFACTS_DIR = path.join(__dirname, "../artifacts");
const SUBMISSIONS_DIR = path.join(ARTIFACTS_DIR, "submissions");
const IPFS_API = process.env.IPFS_API || "http://127.0.0.1:5001/api/v0/add";
if (!fs.existsSync(SUBMISSIONS_DIR)) fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });


app.get("/global", (req, res) => {
  try {
    const aggregatedDir = path.join(__dirname, "../backend/aggregated");
    if (!fs.existsSync(aggregatedDir)) {
      return res.json({ ok: false, msg: "aggregated dir missing" });
    }

    const files = fs.readdirSync(aggregatedDir).filter(f => f.startsWith("global_model_round"));
    if (files.length === 0) return res.json({ ok: false, msg: "no global model yet" });
    const f = files.sort().pop();

    const resultFile = path.join(aggregatedDir, "global_model.json");
    if (!fs.existsSync(resultFile)) {
      return res.json({ ok: true, model_file: f, cid: null, sha256: null, round: null });
    }

    const data = JSON.parse(fs.readFileSync(resultFile, 'utf8'));

    let modelCid = null;
    let sha256 = null;
    let round = null;

    if (Array.isArray(data) && data.length > 0) {
      const entry = data.sort((a, b) => (b.round || 0) - (a.round || 0))[0];
      modelCid = entry.cid || null;
      sha256 = entry.sha256 || null;
      round = entry.round ?? null;
      console.log("Model CID:", modelCid, "SHA256:", sha256, "Round:", round);
    } else if (data && typeof data === 'object') {
      modelCid = data.cid || null;
      sha256 = data.sha256 || null;
      round = data.round ?? null;
    }

    return res.json({ ok: true, model_file: f, cid: modelCid, sha256, round });
  } catch (err) {
    console.error("Error in /global handler:", err);
    return res.status(500).json({ ok: false, err: err.message });
  }
});


app.post("/upload-delta", upload.single("delta"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, msg: "missing file" });
    const filePath = req.file.path;
    const formData = require("form-data");
    const fetch = require("node-fetch");
    const fd = new formData();
    fd.append("file", fs.createReadStream(filePath));
    const ipfsRes = await fetch(IPFS_API, { method: "POST", body: fd });
    const text = await ipfsRes.text();
    const last = text.trim().split("\n").pop();
    const j = JSON.parse(last);
    const cid = j.Hash;
    const dest = path.join(SUBMISSIONS_DIR, `${Date.now()}_${req.file.originalname}`);
    fs.renameSync(filePath, dest);
    return res.json({ ok: true, cid });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, err: err.message });
  }
});

app.post("/submit-payload", (req, res) => {
  try {
    const payload = req.body;
    const required = ["cid","sha256","round","num_examples","quality","submitter","message","signature"];
    for (const k of required) if (!payload[k]) return res.status(400).json({ ok:false, msg:`missing ${k}` });

    const recovered = ethers.utils.verifyMessage(payload.message, payload.signature);
    if (recovered.toLowerCase() !== payload.submitter.toLowerCase()) {
      return res.status(400).json({ ok:false, msg: "signature mismatch" });
    }

    const canonical = `${payload.cid}|round:${payload.round}|examples:${payload.num_examples}|quality:${payload.quality}`;
    if (canonical !== payload.message) {
      return res.status(400).json({ ok:false, msg:"message not canonical" });
    }

    const outPath = path.join(SUBMISSIONS_DIR, `manifest_round${payload.round}_${Date.now()}_${payload.submitter.slice(2,10)}.json`);
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
    return res.json({ ok: true, saved: outPath });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok:false, err: err.message });
  }
});

app.post("/aggregate", (req, res) => {
  try {
    const cwd = path.join(__dirname, "..");
    const out = execFileSync("python3", ["aggregator/aggregate.py", "--round", "1"], { cwd, stdio: "pipe" });
    return res.json({ ok: true, out: out.toString() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok:false, err: err.message, stdout: err.stdout && err.stdout.toString() });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
