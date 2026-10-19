/**
 * ============================================================================
 * ADNA MOMENTS - GOOGLE APPS SCRIPT BACKEND (REST API v2.0)
 * ============================================================================
 * Arsitektur: Serverless REST API dengan Google Drive sebagai Cloud Storage
 * Struktur Folder:
 *   - ADNA Moments / [Tahun] / [Bulan] / [Foto | Video]
 *   - ADNA Moments / Albums / [Nama Album] / [Foto | Video]
 * ============================================================================
 */

const ROOT_FOLDER_NAME = "ADNA Moments";
const ALBUMS_FOLDER_NAME = "Albums";

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
 * Menangani HTTP GET Request dari Frontend
 * Parameter yang didukung:
 * - action: "albums" (ambil daftar semua album)
 * - album: String (ambil isi foto/video dalam album tertentu berdasarkan nama)
 * - albumId: String (ambil isi album berdasarkan folder ID)
 * - year: String (opsional, contoh: "2026")
 * - month: String (opsional, contoh: "10")
 * - type: String ("all" | "photo" | "video")
 */
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const reqAction = (params.action || "").trim().toLowerCase();
    const reqAlbum = (params.album || "").trim();
    const reqAlbumId = (params.albumId || "").trim();
    const reqYear = (params.year || "").trim();
    const reqMonth = (params.month || "").trim();
    const filterType = (params.type || "all").toLowerCase();

    // 1. Dapatkan folder induk ADNA Moments
    const rootFolder = getFolderIfExists(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    if (!rootFolder) {
      return createJsonResponse({ 
        status: "success", 
        data: [], 
        count: 0,
        message: "Root folder belum dibuat di Google Drive." 
      });
    }

    const albumsRoot = getFolderIfExists(rootFolder, ALBUMS_FOLDER_NAME);

    // 2. KASUS A: Mengambil Daftar Semua Album (?action=albums)
    if (reqAction === "albums") {
      if (!albumsRoot) {
        return createJsonResponse({ status: "success", data: [], count: 0 });
      }

      const albumsList = [];
      const albumFolders = albumsRoot.getFolders();

      while (albumFolders.hasNext()) {
        const af = albumFolders.next();
        const afName = af.getName();
        const afDesc = af.getDescription() || "";
        const afDate = af.getDateCreated().toISOString();

        // Hitung file dan tentukan cover album
        let pCount = 0;
        let vCount = 0;
        let coverUrl = "";

        const filesIter = af.getFiles();
        while (filesIter.hasNext()) {
          const f = filesIter.next();
          if (!f.isTrashed()) {
            const mime = f.getMimeType();
            const isVid = mime.indexOf("video/") === 0;
            if (isVid) {
              vCount++;
            } else {
              pCount++;
            }

            // Gunakan thumbnail foto pertama sebagai cover album
            if (!coverUrl && !isVid) {
              coverUrl = "https://drive.google.com/thumbnail?id=" + f.getId() + "&sz=w1000";
            }
          }
        }

        albumsList.push({
          id: af.getId(),
          title: afName,
          description: afDesc,
          createdAt: afDate,
          photoCount: pCount,
          videoCount: vCount,
          totalCount: pCount + vCount,
          coverUrl: coverUrl
        });
      }

      // Urutkan album terbaru dulu
      albumsList.sort(function(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      return createJsonResponse({
        status: "success",
        count: albumsList.length,
        data: albumsList
      });
    }

    // 3. KASUS B: Mengambil Media di dalam Satu Album Tertentu (?album=Nama atau ?albumId=ID)
    if (reqAlbum || reqAlbumId) {
      let targetAlbumFolder = null;
      if (reqAlbumId) {
        targetAlbumFolder = DriveApp.getFolderById(reqAlbumId);
      } else if (albumsRoot) {
        targetAlbumFolder = getFolderIfExists(albumsRoot, reqAlbum);
      }

      if (!targetAlbumFolder) {
        return createJsonResponse({
          status: "error",
          message: "Album '" + (reqAlbum || reqAlbumId) + "' tidak ditemukan."
        });
      }

      const albumFiles = [];
      const afIter = targetAlbumFolder.getFiles();
      while (afIter.hasNext()) {
        const file = afIter.next();
        if (!file.isTrashed()) {
          const item = formatFileObject(file, null, "", "", targetAlbumFolder.getName());
          if (filterType === "all" || item.type === filterType) {
            albumFiles.push(item);
          }
        }
      }

      albumFiles.sort(function(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      return createJsonResponse({
        status: "success",
        album: {
          id: targetAlbumFolder.getId(),
          title: targetAlbumFolder.getName(),
          description: targetAlbumFolder.getDescription() || "",
          createdAt: targetAlbumFolder.getDateCreated().toISOString()
        },
        count: albumFiles.length,
        data: albumFiles
      });
    }

    // 4. KASUS C: Mengambil Galeri Garis Waktu (Berdasarkan Tahun & Bulan)
    let mediaList = [];
    let yearFolders = [];

    if (reqYear && reqYear !== "all") {
      const yf = getFolderIfExists(rootFolder, reqYear);
      if (yf && yf.getName() !== ALBUMS_FOLDER_NAME) {
        yearFolders.push(yf);
      }
    } else {
      const subYears = rootFolder.getFolders();
      while (subYears.hasNext()) {
        const f = subYears.next();
        // Lewati folder "Albums" agar tidak dianggap sebagai folder tahun
        if (f.getName() !== ALBUMS_FOLDER_NAME) {
          yearFolders.push(f);
        }
      }
    }

    for (let i = 0; i < yearFolders.length; i++) {
      const yearFolder = yearFolders[i];
      const yearName = yearFolder.getName();

      let monthFolders = [];
      if (reqMonth && reqMonth !== "all") {
        const targetMonthName = MONTH_NAMES[reqMonth] || reqMonth;
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

      for (let j = 0; j < monthFolders.length; j++) {
        const monthFolder = monthFolders[j];
        const monthName = monthFolder.getName();

        if (filterType === "all" || filterType === "photo" || filterType === "foto") {
          const photoFolder = getFolderIfExists(monthFolder, "Foto");
          if (photoFolder) {
            mediaList = mediaList.concat(extractFilesFromFolder(photoFolder, "photo", yearName, monthName));
          }
        }

        if (filterType === "all" || filterType === "video") {
          const videoFolder = getFolderIfExists(monthFolder, "Video");
          if (videoFolder) {
            mediaList = mediaList.concat(extractFilesFromFolder(videoFolder, "video", yearName, monthName));
          }
        }
      }
    }

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
 * Menangani HTTP POST Request
 * Aksi yang didukung:
 * 1. action: "upload" (Upload Foto / Video baru beserta catatan & album opsional)
 * 2. action: "create_album" (Buat album baru dengan judul & deskripsi pembuka)
 * 3. action: "update_media" (Edit nama file, catatan cinta, atau asosiasi album)
 * 4. action: "update_album" (Edit judul & catatan pembuka album)
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Payload kosong atau tidak valid.");
    }

    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || (payload.base64 ? "upload" : "");

    const rootFolder = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    const albumsRoot = getOrCreateFolder(rootFolder, ALBUMS_FOLDER_NAME);

    // ========================================================
    // AKSI 1: BUAT ALBUM BARU
    // ========================================================
    if (action === "create_album") {
      const albumTitle = (payload.title || "").trim();
      const albumDesc = (payload.description || "").trim();

      if (!albumTitle) {
        throw new Error("Nama album tidak boleh kosong.");
      }

      const albumFolder = getOrCreateFolder(albumsRoot, albumTitle);
      if (albumDesc) {
        albumFolder.setDescription(albumDesc);
      }

      return createJsonResponse({
        status: "success",
        message: "Album '" + albumTitle + "' berhasil dibuat.",
        data: {
          id: albumFolder.getId(),
          title: albumFolder.getName(),
          description: albumFolder.getDescription() || "",
          createdAt: albumFolder.getDateCreated().toISOString(),
          photoCount: 0,
          videoCount: 0,
          totalCount: 0,
          coverUrl: ""
        }
      });
    }

    // ========================================================
    // AKSI 2: EDIT NAMA & CATATAN FOTO / MEDIA
    // ========================================================
    if (action === "update_media") {
      const fileId = payload.fileId;
      if (!fileId) throw new Error("ID File tidak disertakan.");

      const file = DriveApp.getFileById(fileId);
      if (!file) throw new Error("File tidak ditemukan di Google Drive.");

      const newName = (payload.name || "").trim();
      const newNotes = payload.notes !== undefined ? String(payload.notes).trim() : null;
      const targetAlbum = (payload.album || "").trim();

      if (newName) {
        file.setName(newName);
      }

      if (newNotes !== null) {
        file.setDescription(newNotes);
      }

      // Jika pengguna memilih/menambahkan ke album tertentu
      if (targetAlbum) {
        const albumFolder = getOrCreateFolder(albumsRoot, targetAlbum);
        albumFolder.addFile(file);
      }

      return createJsonResponse({
        status: "success",
        message: "Kenangan berhasil diperbarui.",
        data: formatFileObject(file, null, payload.year, payload.month, targetAlbum)
      });
    }

    // ========================================================
    // AKSI 3: EDIT INFORMASI ALBUM
    // ========================================================
    if (action === "update_album") {
      const albumId = payload.albumId;
      const currentTitle = (payload.currentTitle || "").trim();
      const newTitle = (payload.title || "").trim();
      const newDesc = payload.description !== undefined ? String(payload.description).trim() : null;

      let albumFolder = null;
      if (albumId) {
        albumFolder = DriveApp.getFolderById(albumId);
      } else if (currentTitle) {
        albumFolder = getFolderIfExists(albumsRoot, currentTitle);
      }

      if (!albumFolder) throw new Error("Album tidak ditemukan.");

      if (newTitle && newTitle !== albumFolder.getName()) {
        albumFolder.setName(newTitle);
      }
      if (newDesc !== null) {
        albumFolder.setDescription(newDesc);
      }

      return createJsonResponse({
        status: "success",
        message: "Informasi album berhasil diperbarui.",
        data: {
          id: albumFolder.getId(),
          title: albumFolder.getName(),
          description: albumFolder.getDescription() || ""
        }
      });
    }

    // ========================================================
    // AKSI 4: UNGGAH FILE BARU KE CLOUD
    // ========================================================
    if (action === "upload") {
      const fileName = payload.fileName || ("ADNA_" + new Date().getTime());
      const mimeType = payload.mimeType || "application/octet-stream";
      const base64Data = payload.base64;
      const year = String(payload.year || new Date().getFullYear());
      const rawMonth = String(payload.month || String(new Date().getMonth() + 1).padStart(2, '0'));
      const monthFolderName = MONTH_NAMES[rawMonth] || rawMonth;
      const notes = (payload.notes || "").trim();
      const albumName = (payload.album || "").trim();

      if (!base64Data) {
        throw new Error("Data Base64 tidak ditemukan dalam request.");
      }

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

      // Buat struktur folder waktu (Tahun/Bulan)
      const yearFolder = getOrCreateFolder(rootFolder, year);
      const monthFolder = getOrCreateFolder(yearFolder, monthFolderName);
      const targetFolder = getOrCreateFolder(monthFolder, targetSubFolderName);

      // Konversi Base64 ke Blob & simpan
      const decodedBytes = Utilities.base64Decode(base64Data);
      const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);
      const file = targetFolder.createFile(blob);

      // Simpan catatan kenangan jika ada
      if (notes) {
        file.setDescription(notes);
      }

      // Masukkan ke Album jika dipilih
      if (albumName) {
        const albumFolder = getOrCreateFolder(albumsRoot, albumName);
        albumFolder.addFile(file);
      }

      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      return createJsonResponse({
        status: "success",
        message: "File berhasil disimpan ke " + targetSubFolderName + (albumName ? " dan Album " + albumName : ""),
        data: formatFileObject(file, mediaCategory, year, monthFolderName, albumName)
      });
    }

    throw new Error("Aksi tidak valid atau tidak dikenali.");

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
function formatFileObject(file, category, year, monthFolderName, albumName) {
  const id = file.getId();
  const mime = file.getMimeType();
  const detectedCategory = category || (mime.indexOf("video/") === 0 ? "video" : "photo");
  const notes = file.getDescription() || "";

  return {
    id: id,
    name: file.getName(),
    description: notes,
    notes: notes,
    album: albumName || "",
    mimeType: mime,
    type: detectedCategory, // "photo" | "video"
    size: file.getSize(),
    createdAt: file.getDateCreated().toISOString(),
    year: year || "",
    month: monthFolderName || "",
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