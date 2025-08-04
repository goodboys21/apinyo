import axios from "axios";
import FormData from "form-data";
import Busboy from "busboy";

let sessionToken = "63a44a1aa9ba3ad5fe878421b9993a6d883f5e005905e38d29d2bbcca17af54b3303742e8983dba1bd5f2702fe6b86f55239c4e7851583a585cfbb5680e80149a8f73083bbddc9bd";
const refreshToken = "63a44a1aa9ba3ad5fe878421b9993a6d883f5e005905e38d29d2bbcca17af54b3303742e8983dba1bd5f2702fe6b86f55239c4e7851583a585cfbb5680e80149a8f73083bbddc9bd";

let lastRefresh = 0;

async function refreshSessionToken() {
  try {
    const { data } = await axios.post(
      `https://www.mediafire.com/api/1.1/user/renew_session_token.php?session_token=${refreshToken}`,
      null,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const match = data.match(/<session_token>(.*?)<\/session_token>/);
    if (match) {
      sessionToken = match[1];
      console.log("✅ Session token diperbarui.");
    }
  } catch (err) {
    console.error("❌ Gagal refresh session token:", err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Only POST allowed");

  const apikey = req.query.apikey;
  if (apikey !== "bagus") {
    return res.status(403).json({ success: false, message: "API key salah!" });
  }

  // Refresh token tiap 50 detik
  const now = Date.now();
  if (now - lastRefresh > 50000) {
    await refreshSessionToken();
    lastRefresh = now;
  }

  const busboy = Busboy({ headers: req.headers });
  let fileBuffer = null;
  let fileName = "";

  busboy.on("file", (_, file, info) => {
    fileName = info.filename;
    const chunks = [];
    file.on("data", (data) => chunks.push(data));
    file.on("end", () => {
      fileBuffer = Buffer.concat(chunks);
    });
  });

  busboy.on("finish", async () => {
    if (!fileBuffer) {
      return res.status(400).json({ success: false, message: "File tidak ditemukan!" });
    }

    try {
      const form = new FormData();
      form.append("file", fileBuffer, fileName);

      const uploadRes = await axios.post(
        `https://www.mediafire.com/api/1.5/upload/simple.php?session_token=${sessionToken}`,
        form,
        { headers: form.getHeaders() }
      );

      const xml = uploadRes.data;
      const match = xml.match(/<key>(.*?)<\/key>/);
      if (!match) {
        return res.status(500).json({ success: false, message: "Gagal dapat upload key.", raw: xml });
      }

      const listRes = await axios.post("https://www.mediafire.com/api/1.5/folder/get_content.php", null, {
        params: {
          session_token: sessionToken,
          folder_key: "myfiles",
          content_type: "files",
          response_format: "json"
        }
      });

      const files = listRes.data?.response?.folder_content?.files || [];
      const found = files.find(f => f.filename === fileName);

      if (!found) {
        return res.status(500).json({ success: false, message: "File tidak ditemukan dalam list akun.", data: files });
      }

      const uploadDate = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

      return res.json({
        success: true,
        creator: "Bagus Bahril",
        filename: found.filename,
        uploaded_at: uploadDate,
        download_url: found.links.normal_download,
        view_url: found.links.view || null
      });

    } catch (err) {
      return res.status(500).json({ success: false, message: "Upload error.", error: err.message });
    }
  });

  req.pipe(busboy);
}
