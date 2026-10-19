/**
 * ============================================================================
 * ADNA MOMENTS - GOOGLE APPS SCRIPT BACKEND (REST API v2.5)
 * ============================================================================
 * Arsitektur: Serverless REST API dengan Google Drive sebagai Cloud Storage
 * Struktur Hierarki Folder:
 *   ADNA Moments /
 *     └── [Tahun] /
 *           └── [Bulan] /
 *                 ├── Foto /              (Kenangan umum tanpa album)
 *                 ├── Video /             (Video umum tanpa album)
 *                 └── [Nama Album 1] /    (Album yang dibuat pada Tahun & Bulan ini)
 *                 └── [Nama Album 2] /
 * ============================================================================
 */

const ROOT_FOLDER_NAME = "ADNA Moments";

const MONTH_NAMES = {
  "01": "Januari",
  "02": "Februari",
  "03": "Maret",
  "04": "April",
  "05": "Mei",
  "06": "Juni",
  "07": "Juli",
  "08": "Agustus",
  "09": "September",
  "10": "Oktober",
  "11": "November",
  "12": "Desember"
};

/**
 * Menangani HTTP GET Request dari Frontend
 * Parameter yang didukung:
 * - action: "albums" (ambil daftar semua album dari seluruh Tahun/Bulan)
 * - albumId: String (ambil isi album berdasarkan folder ID)
 * - album: String (ambil isi album berdasarkan nama)
 * - year: String (opsional filter tahun)
 * - month: String (opsional filter bulan)
 * - type: String ("all" | "photo" | "video")
 */
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const reqAction = (params.action || "").trim().toLowerCase();
    const reqAlbumId = (params.albumId || "").trim();
    const reqAlbum = (params.album || "").trim();
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

    // ========================================================
    // KASUS A: DAFTAR SEMUA ALBUM (?action=albums)
    // Mencari semua subfolder di [Tahun] / [Bulan] selain "Foto" dan "Video"
    // ========================================================
    if (reqAction === "albums") {
      const albumsList = [];
      const yearFolders = getTargetYearFolders(rootFolder, reqYear);

      for (let y = 0; y < yearFolders.length; y++) {
        const yFolder = yearFolders[y];
        const yName = yFolder.getName();
        const monthFolders = getTargetMonthFolders(yFolder, reqMonth);

        for (let m = 0; m < monthFolders.length; m++) {
          const mFolder = monthFolders[m];
          const mName = mFolder.getName();

          const subFolders = mFolder.getFolders();
          while (subFolders.hasNext()) {
            const sf = subFolders.next();
            const sfName = sf.getName();

            // Folder yang bukan "Foto" dan bukan "Video" adalah Folder Album!
            if (sfName !== "Foto" && sfName !== "Video" && sfName !== "Albums") {
              let pCount = 0;
              let vCount = 0;
              let coverUrl = "";

              const filesIter = sf.getFiles();
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

                  if (!coverUrl && !isVid) {
                    coverUrl = "https://drive.google.com/thumbnail?id=" + f.getId() + "&sz=w1000";
                  }
                }
              }

              albumsList.push({
                id: sf.getId(),
                title: sfName,
                year: yName,
                month: mName,
                description: sf.getDescription() || "",
                createdAt: sf.getDateCreated().toISOString(),
                photoCount: pCount,
                videoCount: vCount,
                totalCount: pCount + vCount,
                coverUrl: coverUrl
              });
            }
          }
        }
      }

      // Urutkan album terbaru berdasarkan tanggal dibuat
      albumsList.sort(function(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      return createJsonResponse({
        status: "success",
        count: albumsList.length,
        data: albumsList
      });
    }

    // ========================================================
    // KASUS B: DETAIL ISI SATU ALBUM (?albumId=... atau ?album=...)
    // ========================================================
    if (reqAlbumId || reqAlbum) {
      let targetAlbumFolder = null;
      if (reqAlbumId) {
        targetAlbumFolder = DriveApp.getFolderById(reqAlbumId);
      } else {
        // Cari folder album berdasarkan nama
        targetAlbumFolder = findAlbumFolderByName(rootFolder, reqAlbum);
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
          const item = formatFileObject(file, null, "", "", targetAlbumFolder.getName(), targetAlbumFolder.getId());
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

    // ========================================================
    // KASUS C: GALERI UTAMA (GARIS WAKTU)
    // Membaca Foto, Video, DAN semua Album di setiap Bulan
    // ========================================================
    let mediaList = [];
    const yearFolders = getTargetYearFolders(rootFolder, reqYear);

    for (let i = 0; i < yearFolders.length; i++) {
      const yearFolder = yearFolders[i];
      const yearName = yearFolder.getName();
      const monthFolders = getTargetMonthFolders(yearFolder, reqMonth);

      for (let j = 0; j < monthFolders.length; j++) {
        const monthFolder = monthFolders[j];
        const monthName = monthFolder.getName();

        // 1. Foto Umum
        if (filterType === "all" || filterType === "photo" || filterType === "foto") {
          const photoFolder = getFolderIfExists(monthFolder, "Foto");
          if (photoFolder) {
            mediaList = mediaList.concat(extractFilesFromFolder(photoFolder, "photo", yearName, monthName, "", ""));
          }
        }

        // 2. Video Umum
        if (filterType === "all" || filterType === "video") {
          const videoFolder = getFolderIfExists(monthFolder, "Video");
          if (videoFolder) {
            mediaList = mediaList.concat(extractFilesFromFolder(videoFolder, "video", yearName, monthName, "", ""));
          }
        }

        // 3. Media di dalam Folder-Folder Album di Bulan ini
        const subFolders = monthFolder.getFolders();
        while (subFolders.hasNext()) {
          const subF = subFolders.next();
          const subFName = subF.getName();
          if (subFName !== "Foto" && subFName !== "Video" && subFName !== "Albums") {
            const albumFiles = extractFilesFromFolder(subF, null, yearName, monthName, subFName, subF.getId());
            for (let k = 0; k < albumFiles.length; k++) {
              if (filterType === "all" || albumFiles[k].type === filterType) {
                mediaList.push(albumFiles[k]);
              }
            }
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
 * 1. action: "upload" (Upload Foto / Video baru ke folder Tahun -> Bulan -> [Foto|Video|Album])
 * 2. action: "create_album" (Buat folder Album di Tahun -> Bulan -> [Nama Album] + opsi assign file)
 * 3. action: "assign_media_to_album" (Pindahkan satu/banyak foto dari galeri ke Album tertentu atau keluarkan)
 * 4. action: "update_media" (Edit nama file, catatan kenangan, atau pindah album)
 * 5. action: "update_album" (Edit nama atau deskripsi album)
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Payload kosong atau tidak valid.");
    }

    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || (payload.base64 ? "upload" : "");

    const rootFolder = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);

    // ========================================================
    // AKSI 1: BUAT ALBUM BARU DI [Tahun] -> [Bulan] -> [Nama Album]
    // ========================================================
    if (action === "create_album") {
      const albumTitle = (payload.title || "").trim();
      const albumDesc = (payload.description || "").trim();
      const year = String(payload.year || new Date().getFullYear());
      const rawMonth = String(payload.month || String(new Date().getMonth() + 1).padStart(2, '0'));
      const monthFolderName = MONTH_NAMES[rawMonth] || rawMonth;
      const selectedFileIds = payload.selectedFileIds || [];

      if (!albumTitle) {
        throw new Error("Nama album tidak boleh kosong.");
      }

      // Pastikan hierarki: ADNA Moments / [Tahun] / [Bulan] / [Nama Album]
      const yearFolder = getOrCreateFolder(rootFolder, year);
      const monthFolder = getOrCreateFolder(yearFolder, monthFolderName);
      const albumFolder = getOrCreateFolder(monthFolder, albumTitle);

      if (albumDesc) {
        albumFolder.setDescription(albumDesc);
      }

      // Jika pengguna memilih foto-foto yang sudah ada di galeri untuk dimasukkan ke album ini
      let movedCount = 0;
      if (Array.isArray(selectedFileIds) && selectedFileIds.length > 0) {
        for (let i = 0; i < selectedFileIds.length; i++) {
          try {
            const f = DriveApp.getFileById(selectedFileIds[i]);
            if (f && !f.isTrashed()) {
              moveFileToFolder(f, albumFolder);
              movedCount++;
            }
          } catch (err) {
            console.warn("Gagal memindahkan file: " + selectedFileIds[i], err);
          }
        }
      }

      return createJsonResponse({
        status: "success",
        message: "Album '" + albumTitle + "' berhasil dibuat di " + year + " / " + monthFolderName + (movedCount > 0 ? " dengan " + movedCount + " foto." : "."),
        data: {
          id: albumFolder.getId(),
          title: albumFolder.getName(),
          year: year,
          month: monthFolderName,
          description: albumFolder.getDescription() || "",
          createdAt: albumFolder.getDateCreated().toISOString(),
          totalCount: movedCount
        }
      });
    }

    // ========================================================
    // AKSI 2: ASSIGN FOTO/MEDIA DARI GALERI KE ALBUM TERTENTU
    // ========================================================
    if (action === "assign_media_to_album") {
      const fileIds = payload.fileIds || (payload.fileId ? [payload.fileId] : []);
      const targetAlbumId = (payload.albumId || "").trim();
      const targetAlbumName = (payload.albumName || payload.album || "").trim();
      const year = String(payload.year || new Date().getFullYear());
      const rawMonth = String(payload.month || String(new Date().getMonth() + 1).padStart(2, '0'));
      const monthFolderName = MONTH_NAMES[rawMonth] || rawMonth;
      const removeFromAlbum = payload.removeFromAlbum === true || (!targetAlbumId && !targetAlbumName);

      if (!fileIds.length) {
        throw new Error("Pilih setidaknya satu kenangan untuk dimasukkan ke album.");
      }

      let targetFolder = null;

      if (removeFromAlbum) {
        // Keluarkan dari album -> kembalikan ke folder Foto / Video umum di bulan tersebut
        const yearFolder = getOrCreateFolder(rootFolder, year);
        const monthFolder = getOrCreateFolder(yearFolder, monthFolderName);

        for (let i = 0; i < fileIds.length; i++) {
          const f = DriveApp.getFileById(fileIds[i]);
          const isVid = f.getMimeType().indexOf("video/") === 0;
          const dest = getOrCreateFolder(monthFolder, isVid ? "Video" : "Foto");
          moveFileToFolder(f, dest);
        }

        return createJsonResponse({
          status: "success",
          message: fileIds.length + " kenangan berhasil dikembalikan ke Galeri Umum."
        });
      }

      // Cari atau buat folder album tujuan
      if (targetAlbumId) {
        targetFolder = DriveApp.getFolderById(targetAlbumId);
      } else if (targetAlbumName) {
        const yearFolder = getOrCreateFolder(rootFolder, year);
        const monthFolder = getOrCreateFolder(yearFolder, monthFolderName);
        targetFolder = getOrCreateFolder(monthFolder, targetAlbumName);
      }

      if (!targetFolder) {
        throw new Error("Folder album tujuan tidak ditemukan.");
      }

      for (let i = 0; i < fileIds.length; i++) {
        const f = DriveApp.getFileById(fileIds[i]);
        moveFileToFolder(f, targetFolder);
      }

      return createJsonResponse({
        status: "success",
        message: fileIds.length + " kenangan berhasil dimasukkan ke album '" + targetFolder.getName() + "'.",
        albumId: targetFolder.getId(),
        albumTitle: targetFolder.getName()
      });
    }

    // ========================================================
    // AKSI 3: EDIT NAMA & CATATAN FOTO / PINDAH ALBUM
    // ========================================================
    if (action === "update_media") {
      const fileId = payload.fileId;
      if (!fileId) throw new Error("ID File tidak disertakan.");

      const file = DriveApp.getFileById(fileId);
      if (!file) throw new Error("File tidak ditemukan di Google Drive.");

      const newName = (payload.name || "").trim();
      const newNotes = payload.notes !== undefined ? String(payload.notes).trim() : null;
      const targetAlbumId = (payload.albumId || "").trim();
      const targetAlbumName = (payload.album || "").trim();
      const year = String(payload.year || new Date().getFullYear());
      const rawMonth = String(payload.month || String(new Date().getMonth() + 1).padStart(2, '0'));
      const monthFolderName = MONTH_NAMES[rawMonth] || rawMonth;

      if (newName) {
        file.setName(newName);
      }

      if (newNotes !== null) {
        file.setDescription(newNotes);
      }

      // Pindahkan folder jika album diubah
      let currentAlbumName = "";
      let currentAlbumId = "";

      if (targetAlbumId) {
        const af = DriveApp.getFolderById(targetAlbumId);
        if (af) {
          moveFileToFolder(file, af);
          currentAlbumName = af.getName();
          currentAlbumId = af.getId();
        }
      } else if (targetAlbumName) {
        const yearFolder = getOrCreateFolder(rootFolder, year);
        const monthFolder = getOrCreateFolder(yearFolder, monthFolderName);
        const af = getOrCreateFolder(monthFolder, targetAlbumName);
        moveFileToFolder(file, af);
        currentAlbumName = af.getName();
        currentAlbumId = af.getId();
      } else if (payload.removeFromAlbum) {
        const yearFolder = getOrCreateFolder(rootFolder, year);
        const monthFolder = getOrCreateFolder(yearFolder, monthFolderName);
        const isVid = file.getMimeType().indexOf("video/") === 0;
        const dest = getOrCreateFolder(monthFolder, isVid ? "Video" : "Foto");
        moveFileToFolder(file, dest);
      }

      return createJsonResponse({
        status: "success",
        message: "Kenangan berhasil diperbarui.",
        data: formatFileObject(file, null, year, monthFolderName, currentAlbumName, currentAlbumId)
      });
    }

    // ========================================================
    // AKSI 4: EDIT INFORMASI ALBUM
    // ========================================================
    if (action === "update_album") {
      const albumId = payload.albumId;
      const newTitle = (payload.title || "").trim();
      const newDesc = payload.description !== undefined ? String(payload.description).trim() : null;

      if (!albumId) throw new Error("ID Album tidak disertakan.");

      const albumFolder = DriveApp.getFolderById(albumId);
      if (!albumFolder) throw new Error("Folder album tidak ditemukan.");

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
    // AKSI 5: UNGGAH FILE BARU KE CLOUD
    // ========================================================
    if (action === "upload") {
      const fileName = payload.fileName || ("ADNA_" + new Date().getTime());
      const mimeType = payload.mimeType || "application/octet-stream";
      const base64Data = payload.base64;
      const year = String(payload.year || new Date().getFullYear());
      const rawMonth = String(payload.month || String(new Date().getMonth() + 1).padStart(2, '0'));
      const monthFolderName = MONTH_NAMES[rawMonth] || rawMonth;
      const notes = (payload.notes || "").trim();
      const albumId = (payload.albumId || "").trim();
      const albumName = (payload.album || "").trim();

      if (!base64Data) {
        throw new Error("Data Base64 tidak ditemukan dalam request.");
      }

      const isVideo = mimeType.indexOf("video/") === 0;
      const mediaCategory = isVideo ? "video" : "photo";

      // Hierarki: [Tahun] -> [Bulan]
      const yearFolder = getOrCreateFolder(rootFolder, year);
      const monthFolder = getOrCreateFolder(yearFolder, monthFolderName);

      // Tentukan folder tujuan file
      let targetFolder = null;
      let targetAlbumTitle = "";
      let targetAlbumFolderId = "";

      if (albumId) {
        targetFolder = DriveApp.getFolderById(albumId);
        targetAlbumTitle = targetFolder.getName();
        targetAlbumFolderId = targetFolder.getId();
      } else if (albumName) {
        targetFolder = getOrCreateFolder(monthFolder, albumName);
        targetAlbumTitle = targetFolder.getName();
        targetAlbumFolderId = targetFolder.getId();
      } else {
        const subFolderName = isVideo ? "Video" : "Foto";
        targetFolder = getOrCreateFolder(monthFolder, subFolderName);
      }

      // Konversi Base64 ke Blob & simpan
      const decodedBytes = Utilities.base64Decode(base64Data);
      const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);
      const file = targetFolder.createFile(blob);

      if (notes) {
        file.setDescription(notes);
      }

      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      return createJsonResponse({
        status: "success",
        message: "File berhasil disimpan ke " + targetFolder.getName(),
        data: formatFileObject(file, mediaCategory, year, monthFolderName, targetAlbumTitle, targetAlbumFolderId)
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
 * Memindahkan file ke folder tujuan tanpa duplikasi
 */
function moveFileToFolder(file, targetFolder) {
  if (typeof file.moveTo === "function") {
    file.moveTo(targetFolder);
    return;
  }
  targetFolder.addFile(file);
  const parents = file.getParents();
  while (parents.hasNext()) {
    const parent = parents.next();
    if (parent.getId() !== targetFolder.getId()) {
      parent.removeFile(file);
    }
  }
}

/**
 * Mencari folder album berdasarkan nama di seluruh Tahun & Bulan
 */
function findAlbumFolderByName(rootFolder, albumName) {
  const yIter = rootFolder.getFolders();
  while (yIter.hasNext()) {
    const yf = yIter.next();
    const mIter = yf.getFolders();
    while (mIter.hasNext()) {
      const mf = mIter.next();
      const subIter = mf.getFolders();
      while (subIter.hasNext()) {
        const sf = subIter.next();
        if (sf.getName() === albumName && sf.getName() !== "Foto" && sf.getName() !== "Video") {
          return sf;
        }
      }
    }
  }
  return null;
}

/**
 * Mengambil daftar folder tahun sesuai filter
 */
function getTargetYearFolders(rootFolder, reqYear) {
  const yearFolders = [];
  if (reqYear && reqYear !== "all") {
    const yf = getFolderIfExists(rootFolder, reqYear);
    if (yf) yearFolders.push(yf);
  } else {
    const subYears = rootFolder.getFolders();
    while (subYears.hasNext()) {
      yearFolders.push(subYears.next());
    }
  }
  return yearFolders;
}

/**
 * Mengambil daftar folder bulan di dalam folder tahun sesuai filter
 */
function getTargetMonthFolders(yearFolder, reqMonth) {
  const monthFolders = [];
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
  return monthFolders;
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
function extractFilesFromFolder(folder, category, year, monthFolderName, albumName, albumId) {
  const result = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (!file.isTrashed()) {
      result.push(formatFileObject(file, category, year, monthFolderName, albumName, albumId));
    }
  }
  return result;
}

/**
 * Memformat objek File Google Drive menjadi struktur data respons JSON yang ramah web.
 */
function formatFileObject(file, category, year, monthFolderName, albumName, albumId) {
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
    albumId: albumId || "",
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