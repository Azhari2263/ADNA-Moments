/**
 * ============================================================================
 * ADNA MOMENTS - GOOGLE APPS SCRIPT BACKEND (REST API)
 * ============================================================================
 * Arsitektur: Serverless REST API dengan Google Drive sebagai Cloud Storage
 * Struktur Folder: ADNA Moments / [Tahun] / [Bulan] / [Foto | Video]
 * ============================================================================
 */

const ROOT_FOLDER_NAME = "ADNA Moments";

const MONTH_NAMES = {
  "01": "01 - Januari",
  "02": "02 - Februari",
  "03": "03 - Maret",
  "04": "04 - April",
  "05": "05 - Mei",
  "06": "06 - Juni",
  "07": "07 - Juli",
  "08": "08 - Agustus",
  "09": "09 - September",
  "10": "10 - Oktober",
  "11": "11 - November",
  "12": "12 - Desember"
};

/**
 * Menangani HTTP GET Request dari Frontend (Vercel / GitHub Pages / PWA)
 * Query Parameters yang didukung:
 * - year: String (opsional, contoh: "2026". Jika kosong / "all", mengambil semua tahun)
 * - month: String (opsional, contoh: "10" atau "10 - Oktober". Jika kosong / "all", mengambil semua bulan)
 * - type: String ("all" | "photo" | "video")
 */
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const reqYear = (params.year || "").trim();
    const reqMonth = (params.month || "").trim();
    const filterType = (params.type || "all").toLowerCase();

    // 1. Cek folder induk ADNA Moments
    const rootFolder = getFolderIfExists(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    if (!rootFolder) {
      return createJsonResponse({ 
        status: "success", 
        data: [], 
        count: 0,
        message: "Root folder belum dibuat di Google Drive." 
      });
    }

    let mediaList = [];

    // 2. Tentukan folder tahun yang akan dipindai
    let yearFolders = [];
    if (reqYear && reqYear !== "all") {
      const yf = getFolderIfExists(rootFolder, reqYear);
      if (yf) yearFolders.push(yf);
    } else {
      const subYears = rootFolder.getFolders();
      while (subYears.hasNext()) {
        yearFolders.push(subYears.next());
      }
    }

    // 3. Pindai setiap folder tahun
    for (let i = 0; i < yearFolders.length; i++) {
      const yearFolder = yearFolders[i];
      const yearName = yearFolder.getName();

      // Tentukan folder bulan
      let monthFolders = [];
      if (reqMonth && reqMonth !== "all") {
        const targetMonthName = MONTH_NAMES[reqMonth] || reqMonth;
        // Cari folder bulan yang cocok persis atau berawalan angka bulan
        const mfIter = yearFolder.getFolders();
        while (mfIter.hasNext()) {
          const mf = mfIter.next();
          if (mf.getName() === targetMonthName || mf.getName().indexOf(reqMonth) === 0) {
            monthFolders.push(mf);
          }
        }
      } else {
        const subMonths = yearFolder.getFolders();
        while (subMonths.hasNext()) {
          monthFolders.push(subMonths.next());
        }
      }

      // Pindai subfolder Foto dan Video di setiap bulan
      for (let j = 0; j < monthFolders.length; j++) {
        const monthFolder = monthFolders[j];
        const monthName = monthFolder.getName();

        // Subfolder Foto
        if (filterType === "all" || filterType === "photo" || filterType === "foto") {
          const photoFolder = getFolderIfExists(monthFolder, "Foto");
          if (photoFolder) {
            mediaList = mediaList.concat(extractFilesFromFolder(photoFolder, "photo", yearName, monthName));
          }
        }

        // Subfolder Video
        if (filterType === "all" || filterType === "video") {
          const videoFolder = getFolderIfExists(monthFolder, "Video");
          if (videoFolder) {
            mediaList = mediaList.concat(extractFilesFromFolder(videoFolder, "video", yearName, monthName));
          }
        }
      }
    }

    // 4. Urutkan berdasarkan waktu unggah terbaru (descending)
    mediaList.sort(function(a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return createJsonResponse({
      status: "success",
      filter: { year: reqYear || "all", month: reqMonth || "all", type: filterType },
      count: mediaList.length,
      data: mediaList
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}

/**
 * Menangani HTTP POST Request untuk Upload File (Base64)
 * Menghindari error CORS OPTIONS preflight dengan payload JSON (Content-Type: text/plain).
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Payload kosong atau tidak valid.");
    }

    const payload = JSON.parse(e.postData.contents);
    const fileName = payload.fileName || ("ADNA_" + new Date().getTime());
    const mimeType = payload.mimeType || "application/octet-stream";
    const base64Data = payload.base64;
    const year = String(payload.year || new Date().getFullYear());
    const rawMonth = String(payload.month || String(new Date().getMonth() + 1).padStart(2, '0'));
    const monthFolderName = MONTH_NAMES[rawMonth] || rawMonth;

    if (!base64Data) {
      throw new Error("Data Base64 tidak ditemukan dalam request.");
    }

    // 1. Tentukan subfolder ("Foto" atau "Video") berdasarkan MIME Type
    let targetSubFolderName = "";
    let mediaCategory = "";

    if (mimeType.indexOf("image/") === 0) {
      targetSubFolderName = "Foto";
      mediaCategory = "photo";
    } else if (mimeType.indexOf("video/") === 0) {
      targetSubFolderName = "Video";
      mediaCategory = "video";
    } else {
      throw new Error("Tipe file tidak didukung (" + mimeType + "). Harap unggah Gambar atau Video.");
    }

    // 2. Bangun struktur hierarki folder otomatis jika belum ada
    const rootFolder = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    const yearFolder = getOrCreateFolder(rootFolder, year);
    const monthFolder = getOrCreateFolder(yearFolder, monthFolderName);
    const targetFolder = getOrCreateFolder(monthFolder, targetSubFolderName);

    // 3. Konversi Base64 ke Blob & simpan ke Google Drive
    const decodedBytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);
    const file = targetFolder.createFile(blob);

    // 4. Setel izin akses publik agar file dapat diakses di aplikasi web
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return createJsonResponse({
      status: "success",
      message: "File berhasil disimpan ke " + targetSubFolderName,
      data: formatFileObject(file, mediaCategory, year, monthFolderName)
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}

/**
 * Mencari folder berdasarkan nama di dalam parent folder.
 * Jika belum ada, buat folder baru otomatis (mencegah duplikasi).
 */
function getOrCreateFolder(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(folderName);
}

/**
 * Mencari folder berdasarkan nama tanpa membuatnya jika tidak ada.
 */
function getFolderIfExists(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return null;
}

/**
 * Mengekstrak seluruh file dari folder Drive tanpa file sampah (trashed).
 */
function extractFilesFromFolder(folder, category, year, monthFolderName) {
  const result = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (!file.isTrashed()) {
      result.push(formatFileObject(file, category, year, monthFolderName));
    }
  }
  return result;
}

/**
 * Memformat objek File Google Drive menjadi struktur data respons JSON yang ramah web.
 */
function formatFileObject(file, category, year, monthFolderName) {
  const id = file.getId();
  return {
    id: id,
    name: file.getName(),
    mimeType: file.getMimeType(),
    type: category, // "photo" | "video"
    size: file.getSize(),
    createdAt: file.getDateCreated().toISOString(),
    year: year,
    month: monthFolderName,
    thumbnailUrl: "https://drive.google.com/thumbnail?id=" + id + "&sz=w1000",
    highResUrl: "https://drive.google.com/thumbnail?id=" + id + "&sz=w2000",
    streamUrl: "https://drive.google.com/uc?export=download&id=" + id,
    embedPreviewUrl: "https://drive.google.com/file/d/" + id + "/preview",
    viewUrl: file.getUrl()
  };
}

/**
 * Membungkus output dalam ContentService JSON.
 */
function createJsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}