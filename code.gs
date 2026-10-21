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
    let rootFolder = getFolderIfExists(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    if (!rootFolder) {
      if (reqAction === "bucketlist" || filterType === "bucketlist") {
        rootFolder = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
      } else {
        return createJsonResponse({ 
          status: "success", 
          data: [], 
          count: 0,
          message: "Root folder belum dibuat di Google Drive." 
        });
      }
    }

    // ========================================================
    // KASUS SPREADSHEET: BUCKET LIST (?action=bucketlist)
    // ========================================================
    if (reqAction === "bucketlist" || filterType === "bucketlist") {
      const ss = getOrCreateDatabaseSpreadsheet(rootFolder);
      const sheet = getOrCreateSheet(ss, "BucketList", [
        "id", "title", "category", "targetDate", "completed", "completedDate", "notes", "photoUrl", "photoId", "albumId", "createdAt", "updatedAt"
      ]);
      const items = getSheetRecords(sheet);
      return createJsonResponse({
        status: "success",
        count: items.length,
        data: items
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

              let aDesc = sf.getDescription() || "";
              let aDate = "";
              const aDateMatch = aDesc.match(/^\[DATE:(\d{4}-\d{2}-\d{2})\]\s*/);
              if (aDateMatch) {
                aDate = aDateMatch[1];
                aDesc = aDesc.substring(aDateMatch[0].length);
              } else {
                aDate = sf.getDateCreated().toISOString().split('T')[0];
              }

              albumsList.push({
                id: sf.getId(),
                title: sfName,
                year: yName,
                month: mName,
                date: aDate,
                description: aDesc,
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

      // Urutkan album terbaru berdasarkan tanggal momen atau tanggal dibuat
      albumsList.sort(function(a, b) {
        const dateA = a.date ? new Date(a.date).getTime() : new Date(a.createdAt).getTime();
        const dateB = b.date ? new Date(b.date).getTime() : new Date(b.createdAt).getTime();
        return dateB - dateA;
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

      let singleDesc = targetAlbumFolder.getDescription() || "";
      let singleDate = "";
      const sMatch = singleDesc.match(/^\[DATE:(\d{4}-\d{2}-\d{2})\]\s*/);
      if (sMatch) {
        singleDate = sMatch[1];
        singleDesc = singleDesc.substring(sMatch[0].length);
      } else {
        singleDate = targetAlbumFolder.getDateCreated().toISOString().split('T')[0];
      }

      return createJsonResponse({
        status: "success",
        album: {
          id: targetAlbumFolder.getId(),
          title: targetAlbumFolder.getName(),
          description: singleDesc,
          date: singleDate,
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
      const albumDate = (payload.date || "").trim();

      let year = String(payload.year || "");
      let rawMonth = String(payload.month || "");
      if (albumDate && (!year || !rawMonth)) {
        const parts = albumDate.split('-');
        if (parts.length >= 2) {
          year = year || parts[0];
          rawMonth = rawMonth || parts[1];
        }
      }
      year = year || String(new Date().getFullYear());
      rawMonth = rawMonth || String(new Date().getMonth() + 1).padStart(2, '0');
      const monthFolderName = MONTH_NAMES[rawMonth] || rawMonth;
      const selectedFileIds = payload.selectedFileIds || [];

      if (!albumTitle) {
        throw new Error("Nama album tidak boleh kosong.");
      }

      // Pastikan hierarki: ADNA Moments / [Tahun] / [Bulan] / [Nama Album]
      const yearFolder = getOrCreateFolder(rootFolder, year);
      const monthFolder = getOrCreateFolder(yearFolder, monthFolderName);
      const albumFolder = getOrCreateFolder(monthFolder, albumTitle);

      let fullDesc = albumDesc;
      if (albumDate) {
        fullDesc = "[DATE:" + albumDate + "] " + albumDesc;
      }
      if (fullDesc) {
        albumFolder.setDescription(fullDesc);
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
      const newDate = (payload.date || "").trim();
      const targetAlbumId = (payload.albumId || "").trim();
      const targetAlbumName = (payload.album || "").trim();
      const year = String(payload.year || new Date().getFullYear());
      const rawMonth = String(payload.month || String(new Date().getMonth() + 1).padStart(2, '0'));
      const monthFolderName = MONTH_NAMES[rawMonth] || rawMonth;

      if (newName) {
        file.setName(newName);
      }

      if (newNotes !== null || newDate) {
        const existingDesc = file.getDescription() || "";
        let existingNotes = existingDesc;
        let currentDate = "";
        const dateMatch = existingDesc.match(/^\[DATE:(\d{4}-\d{2}-\d{2})\]\s*/);
        if (dateMatch) {
          currentDate = dateMatch[1];
          existingNotes = existingDesc.substring(dateMatch[0].length);
        }
        const notesToSave = newNotes !== null ? newNotes : existingNotes;
        const dateToSave = newDate || currentDate;
        let finalDesc = notesToSave;
        if (dateToSave) {
          finalDesc = "[DATE:" + dateToSave + "] " + notesToSave;
        }
        file.setDescription(finalDesc);
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
    // AKSI 4: EDIT INFORMASI ALBUM (JUDUL, CATATAN & TANGGAL MOMEN)
    // ========================================================
    if (action === "update_album") {
      const albumId = payload.albumId;
      const newTitle = (payload.title || "").trim();
      const newDesc = payload.description !== undefined ? String(payload.description).trim() : null;
      const newDate = (payload.date || "").trim();

      if (!albumId) throw new Error("ID Album tidak disertakan.");

      const albumFolder = DriveApp.getFolderById(albumId);
      if (!albumFolder) throw new Error("Folder album tidak ditemukan.");

      if (newTitle && newTitle !== albumFolder.getName()) {
        albumFolder.setName(newTitle);
      }

      const existingDesc = albumFolder.getDescription() || "";
      let existingNotes = existingDesc;
      let existingDate = "";
      const dMatch = existingDesc.match(/^\[DATE:(\d{4}-\d{2}-\d{2})\]\s*/);
      if (dMatch) {
        existingDate = dMatch[1];
        existingNotes = existingDesc.substring(dMatch[0].length);
      }
      const notesToSave = newDesc !== null ? newDesc : existingNotes;
      const dateToSave = newDate || existingDate;
      let fullDesc = notesToSave;
      if (dateToSave) {
        fullDesc = "[DATE:" + dateToSave + "] " + notesToSave;
      }
      albumFolder.setDescription(fullDesc);

      return createJsonResponse({
        status: "success",
        message: "Informasi album berhasil diperbarui.",
        data: {
          id: albumFolder.getId(),
          title: albumFolder.getName(),
          description: notesToSave,
          date: dateToSave
        }
      });
    }

    // ========================================================
    // AKSI: HAPUS FOTO / MEDIA SECARA PERMANEN DARI GOOGLE DRIVE
    // ========================================================
    if (action === "delete_media") {
      const fileIds = payload.fileIds || (payload.fileId ? [payload.fileId] : []);
      if (!fileIds.length) throw new Error("ID File tidak disertakan.");

      let deletedCount = 0;
      for (let i = 0; i < fileIds.length; i++) {
        const fid = String(fileIds[i]).trim();
        if (fid) {
          try {
            permanentlyDeleteDriveFile(fid);
            deletedCount++;
          } catch (err) {
            console.warn("Gagal menghapus file: " + fid, err);
          }
        }
      }

      // Bersihkan referensi bukti foto di BucketList jika ada
      try {
        const ss = getOrCreateDatabaseSpreadsheet(rootFolder);
        const sheet = ss.getSheetByName("BucketList");
        if (sheet) {
          const data = sheet.getDataRange().getValues();
          if (data.length > 1) {
            const headers = data[0].map(function(h) { return String(h).trim(); });
            const photoIdCol = headers.indexOf("photoId");
            const photoUrlCol = headers.indexOf("photoUrl");
            if (photoIdCol >= 0 && photoUrlCol >= 0) {
              for (let r = 1; r < data.length; r++) {
                const rowPhotoId = String(data[r][photoIdCol]).trim();
                if (fileIds.indexOf(rowPhotoId) !== -1) {
                  sheet.getRange(r + 1, photoIdCol + 1).setValue("");
                  sheet.getRange(r + 1, photoUrlCol + 1).setValue("");
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("Gagal update BucketList sheet saat hapus file:", e);
      }

      return createJsonResponse({
        status: "success",
        message: deletedCount + " file kenangan berhasil dihapus secara permanen dari Google Drive.",
        count: deletedCount
      });
    }

    // ========================================================
    // AKSI: HAPUS ALBUM BESERTA SEMUA ISINYA SECARA PERMANEN
    // ========================================================
    if (action === "delete_album") {
      const albumId = String(payload.albumId || "").trim();
      if (!albumId) throw new Error("ID Album tidak disertakan.");

      let albumName = "Album";
      try {
        const af = DriveApp.getFolderById(albumId);
        albumName = af.getName();
      } catch (e) {}

      permanentlyDeleteDriveFolder(albumId);

      // Bersihkan referensi albumId di BucketList jika ada
      try {
        const ss = getOrCreateDatabaseSpreadsheet(rootFolder);
        const sheet = ss.getSheetByName("BucketList");
        if (sheet) {
          const data = sheet.getDataRange().getValues();
          if (data.length > 1) {
            const headers = data[0].map(function(h) { return String(h).trim(); });
            const albumIdCol = headers.indexOf("albumId");
            if (albumIdCol >= 0) {
              for (let r = 1; r < data.length; r++) {
                if (String(data[r][albumIdCol]).trim() === albumId) {
                  sheet.getRange(r + 1, albumIdCol + 1).setValue("");
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("Gagal update BucketList sheet saat hapus album:", e);
      }

      return createJsonResponse({
        status: "success",
        message: "Album '" + albumName + "' dan seluruh file di dalamnya berhasil dihapus secara permanen dari Google Drive."
      });
    }

    // ========================================================
    // AKSI 5: UNGGAH FILE BARU KE CLOUD
    // ========================================================
    if (action === "upload") {
      const fileName = payload.fileName || ("ADNA_" + new Date().getTime());
      const mimeType = payload.mimeType || "application/octet-stream";
      const base64Data = payload.base64;
      const uploadDate = (payload.date || "").trim();
      let year = String(payload.year || "");
      let rawMonth = String(payload.month || "");
      if (uploadDate && (!year || !rawMonth)) {
        const parts = uploadDate.split('-');
        if (parts.length >= 2) {
          year = year || parts[0];
          rawMonth = rawMonth || parts[1];
        }
      }
      year = year || String(new Date().getFullYear());
      rawMonth = rawMonth || String(new Date().getMonth() + 1).padStart(2, '0');
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
        try {
          targetFolder = DriveApp.getFolderById(albumId);
          if (targetFolder) {
            targetAlbumTitle = targetFolder.getName();
            targetAlbumFolderId = targetFolder.getId();
          }
        } catch (e) {
          targetFolder = null;
        }
      }
      if (!targetFolder && albumName) {
        // Cari folder album yang cocok di seluruh hierarki rootFolder
        targetFolder = findAlbumFolderByName(rootFolder, albumName);
        if (!targetFolder) {
          targetFolder = getOrCreateFolder(monthFolder, albumName);
        }
        targetAlbumTitle = targetFolder.getName();
        targetAlbumFolderId = targetFolder.getId();
      } else if (!targetFolder) {
        const subFolderName = isVideo ? "Video" : "Foto";
        targetFolder = getOrCreateFolder(monthFolder, subFolderName);
      }

      // Konversi Base64 ke Blob & simpan
      const decodedBytes = Utilities.base64Decode(base64Data);
      const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);
      const file = targetFolder.createFile(blob);

      let finalDesc = notes;
      if (uploadDate) {
        finalDesc = "[DATE:" + uploadDate + "] " + notes;
      }
      if (finalDesc) {
        file.setDescription(finalDesc);
      }

      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      return createJsonResponse({
        status: "success",
        message: "File berhasil disimpan ke " + targetFolder.getName(),
        data: formatFileObject(file, mediaCategory, year, monthFolderName, targetAlbumTitle, targetAlbumFolderId)
      });
    }

    // ========================================================
    // AKSI 1.1: UPLOAD FILE BESAR BERTAHAP (CHUNKED UPLOAD > 25MB)
    // ========================================================
    if (action === "upload_chunk") {
      const uploadId = String(payload.uploadId || "").trim();
      const chunkIndex = parseInt(payload.chunkIndex, 10);
      const totalChunks = parseInt(payload.totalChunks, 10);
      const base64Chunk = payload.base64;
      const fileName = payload.fileName || ("ADNA_" + new Date().getTime());
      const mimeType = payload.mimeType || "application/octet-stream";
      const uploadDate = (payload.date || "").trim();
      let year = String(payload.year || "");
      let rawMonth = String(payload.month || "");
      if (uploadDate && (!year || !rawMonth)) {
        const parts = uploadDate.split('-');
        if (parts.length >= 2) {
          year = year || parts[0];
          rawMonth = rawMonth || parts[1];
        }
      }
      year = year || String(new Date().getFullYear());
      rawMonth = rawMonth || String(new Date().getMonth() + 1).padStart(2, '0');
      const monthFolderName = MONTH_NAMES[rawMonth] || rawMonth;
      const notes = (payload.notes || "").trim();
      const albumId = (payload.albumId || "").trim();
      const albumName = (payload.album || "").trim();

      if (!uploadId) throw new Error("Upload ID tidak disertakan.");
      if (isNaN(chunkIndex) || isNaN(totalChunks)) throw new Error("Index atau Total Chunk tidak valid.");
      if (!base64Chunk) throw new Error("Data chunk Base64 kosong.");

      // Buat / dapatkan folder temporary untuk upload sesi ini
      const tempUploadsFolder = getOrCreateFolder(rootFolder, ".temp_chunks");
      const sessionFolder = getOrCreateFolder(tempUploadsFolder, uploadId);

      // Simpan chunk saat ini sebagai file sementara
      const decodedChunk = Utilities.base64Decode(base64Chunk);
      const chunkBlob = Utilities.newBlob(decodedChunk, "application/octet-stream", "chunk_" + chunkIndex);
      sessionFolder.createFile(chunkBlob);

      // Jika masih ada chunk berikutnya, kembalikan status sukses parsial
      if (chunkIndex < totalChunks - 1) {
        return createJsonResponse({
          status: "success",
          chunkIndex: chunkIndex,
          totalChunks: totalChunks,
          progress: Math.round(((chunkIndex + 1) / totalChunks) * 100),
          message: "Bagian " + (chunkIndex + 1) + " dari " + totalChunks + " berhasil diunggah."
        });
      }

      // SEMUA CHUNK LENGKAP: Gabungkan semua chunk menjadi satu file utuh
      const isVideo = mimeType.indexOf("video/") === 0;
      const mediaCategory = isVideo ? "video" : "photo";

      const yearFolder = getOrCreateFolder(rootFolder, year);
      const monthFolder = getOrCreateFolder(yearFolder, monthFolderName);

      let targetFolder = null;
      let targetAlbumTitle = "";
      let targetAlbumFolderId = "";

      if (albumId) {
        try {
          targetFolder = DriveApp.getFolderById(albumId);
          if (targetFolder) {
            targetAlbumTitle = targetFolder.getName();
            targetAlbumFolderId = targetFolder.getId();
          }
        } catch (e) {
          targetFolder = null;
        }
      }
      if (!targetFolder && albumName) {
        targetFolder = findAlbumFolderByName(rootFolder, albumName);
        if (!targetFolder) {
          targetFolder = getOrCreateFolder(monthFolder, albumName);
        }
        targetAlbumTitle = targetFolder.getName();
        targetAlbumFolderId = targetFolder.getId();
      } else if (!targetFolder) {
        const subFolderName = isVideo ? "Video" : "Foto";
        targetFolder = getOrCreateFolder(monthFolder, subFolderName);
      }

      // Gabungkan seluruh blob chunk
      const chunkBlobs = [];
      let totalBytesLength = 0;
      for (let c = 0; c < totalChunks; c++) {
        const cIter = sessionFolder.getFilesByName("chunk_" + c);
        if (!cIter.hasNext()) {
          throw new Error("Bagian chunk_" + c + " hilang atau gagal diunggah.");
        }
        const cf = cIter.next();
        const b = cf.getBlob();
        chunkBlobs.push(b);
        totalBytesLength += b.getBytes().length;
      }

      const combinedBytes = new Int8Array(totalBytesLength);
      let offset = 0;
      for (let c = 0; c < chunkBlobs.length; c++) {
        const bytes = chunkBlobs[c].getBytes();
        combinedBytes.set(bytes, offset);
        offset += bytes.length;
      }

      const finalBlob = Utilities.newBlob(Array.from(combinedBytes), mimeType, fileName);
      const finalFile = targetFolder.createFile(finalBlob);

      let finalDesc = notes;
      if (uploadDate) {
        finalDesc = "[DATE:" + uploadDate + "] " + notes;
      }
      if (finalDesc) {
        finalFile.setDescription(finalDesc);
      }

      finalFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      // Bersihkan folder sesi chunk
      try {
        sessionFolder.setTrashed(true);
      } catch (cleanErr) {
        console.warn("Gagal membersihkan temp folder chunk: " + cleanErr);
      }

      return createJsonResponse({
        status: "success",
        message: "File (" + fileName + ") berhasil disimpan ke " + targetFolder.getName(),
        data: formatFileObject(finalFile, mediaCategory, year, monthFolderName, targetAlbumTitle, targetAlbumFolderId)
      });
    }

    // ========================================================
    // AKSI 6: SIMPAN / PERBARUI IMPIAN BUCKET LIST (SPREADSHEET)
    // ========================================================
    if (action === "save_bucketlist_item") {
      const item = payload.item || payload;
      const itemId = String(item.id || ("bl_" + new Date().getTime())).trim();
      const title = String(item.title || "").trim();
      const category = String(item.category || "travel").trim();
      const targetDate = String(item.targetDate || "").trim();
      const completed = item.completed === true || String(item.completed).toUpperCase() === "TRUE";
      const completedDate = String(item.completedDate || "").trim();
      const notes = String(item.notes || "").trim();
      const photoUrl = String(item.photoUrl || "").trim();
      const photoId = String(item.photoId || "").trim();
      const albumId = String(item.albumId || "").trim();
      const nowIso = new Date().toISOString();

      if (!title) {
        throw new Error("Nama impian tidak boleh kosong.");
      }

      const ss = getOrCreateDatabaseSpreadsheet(rootFolder);
      const sheet = getOrCreateSheet(ss, "BucketList", [
        "id", "title", "category", "targetDate", "completed", "completedDate", "notes", "photoUrl", "photoId", "albumId", "createdAt", "updatedAt"
      ]);

      const data = sheet.getDataRange().getValues();
      let foundRow = -1;

      for (let r = 1; r < data.length; r++) {
        if (String(data[r][0]).trim() === itemId) {
          foundRow = r + 1;
          break;
        }
      }

      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).trim(); });
      const rowData = new Array(headers.length);

      for (let c = 0; c < headers.length; c++) {
        const key = headers[c];
        if (key === "id") rowData[c] = itemId;
        else if (key === "title") rowData[c] = title;
        else if (key === "category") rowData[c] = category;
        else if (key === "targetDate") rowData[c] = targetDate;
        else if (key === "completed") rowData[c] = completed ? "TRUE" : "FALSE";
        else if (key === "completedDate") rowData[c] = completedDate;
        else if (key === "notes") rowData[c] = notes;
        else if (key === "photoUrl") rowData[c] = photoUrl;
        else if (key === "photoId") rowData[c] = photoId;
        else if (key === "albumId") rowData[c] = albumId;
        else if (key === "createdAt") rowData[c] = foundRow > 0 ? (data[foundRow - 1][c] || nowIso) : nowIso;
        else if (key === "updatedAt") rowData[c] = nowIso;
        else rowData[c] = "";
      }

      if (foundRow > 0) {
        sheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
      } else {
        sheet.appendRow(rowData);
      }

      return createJsonResponse({
        status: "success",
        message: "Impian berhasil disimpan ke Spreadsheet.",
        data: {
          id: itemId,
          title: title,
          category: category,
          targetDate: targetDate,
          completed: completed,
          completedDate: completedDate,
          notes: notes,
          photoUrl: photoUrl,
          photoId: photoId,
          albumId: albumId,
          createdAt: foundRow > 0 ? (data[foundRow - 1][headers.indexOf("createdAt")] || nowIso) : nowIso,
          updatedAt: nowIso
        }
      });
    }

    // ========================================================
    // AKSI 7: HAPUS IMPIAN DARI SPREADSHEET
    // ========================================================
    if (action === "delete_bucketlist_item") {
      const itemId = String(payload.id || "").trim();
      if (!itemId) throw new Error("ID impian tidak disertakan.");

      const ss = getOrCreateDatabaseSpreadsheet(rootFolder);
      const sheet = ss.getSheetByName("BucketList");
      if (sheet) {
        const data = sheet.getDataRange().getValues();
        for (let r = 1; r < data.length; r++) {
          if (String(data[r][0]).trim() === itemId) {
            sheet.deleteRow(r + 1);
            break;
          }
        }
      }

      return createJsonResponse({
        status: "success",
        message: "Impian berhasil dihapus dari Spreadsheet."
      });
    }

    // ========================================================
    // AKSI 8: TOGGLE STATUS IMPIAN (SELESAI / BELUM)
    // ========================================================
    if (action === "toggle_bucketlist_item") {
      const itemId = String(payload.id || "").trim();
      if (!itemId) throw new Error("ID impian tidak disertakan.");

      const ss = getOrCreateDatabaseSpreadsheet(rootFolder);
      const sheet = getOrCreateSheet(ss, "BucketList", [
        "id", "title", "category", "targetDate", "completed", "completedDate", "notes", "photoUrl", "photoId", "albumId", "createdAt", "updatedAt"
      ]);

      const data = sheet.getDataRange().getValues();
      let foundRow = -1;
      let currentStatus = false;
      let targetCompletedDate = "";

      for (let r = 1; r < data.length; r++) {
        if (String(data[r][0]).trim() === itemId) {
          foundRow = r + 1;
          currentStatus = String(data[r][4]).toUpperCase() === "TRUE";
          break;
        }
      }

      if (foundRow > 0) {
        const newStatus = payload.completed !== undefined ? (payload.completed === true || String(payload.completed).toUpperCase() === "TRUE") : !currentStatus;
        if (newStatus) {
          targetCompletedDate = payload.completedDate || new Date().toISOString().split("T")[0];
        }
        sheet.getRange(foundRow, 5).setValue(newStatus ? "TRUE" : "FALSE");
        sheet.getRange(foundRow, 6).setValue(targetCompletedDate);
        sheet.getRange(foundRow, 11).setValue(new Date().toISOString());

        return createJsonResponse({
          status: "success",
          data: {
            id: itemId,
            completed: newStatus,
            completedDate: targetCompletedDate
          }
        });
      } else {
        throw new Error("Impian tidak ditemukan di spreadsheet.");
      }
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
  const rawDesc = file.getDescription() || "";
  let notes = rawDesc;
  let eventDate = "";
  const dateMatch = rawDesc.match(/^\[DATE:(\d{4}-\d{2}-\d{2})\]\s*/);
  if (dateMatch) {
    eventDate = dateMatch[1];
    notes = rawDesc.substring(dateMatch[0].length);
  } else {
    eventDate = file.getDateCreated().toISOString().split('T')[0];
  }

  return {
    id: id,
    name: file.getName(),
    description: notes,
    notes: notes,
    date: eventDate,
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
    streamUrl: "https://drive.google.com/file/d/" + id + "/preview",
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

// ============================================================================
// MODUL DATABASE GOOGLE SPREADSHEET (CLOUD SYNC ANTAR-DEVICE)
// ============================================================================
const SPREADSHEET_DB_NAME = "ADNA Moments Database";

/**
 * Mendapatkan atau membuat Spreadsheet Database di dalam folder induk ADNA Moments.
 * Otomatis menangani rootFolder jika tidak disertakan (misal saat dijalankan manual dari editor Apps Script).
 */
function getOrCreateDatabaseSpreadsheet(rootFolder) {
  if (!rootFolder) {
    rootFolder = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  }

  const files = rootFolder.getFilesByName(SPREADSHEET_DB_NAME);
  if (files.hasNext()) {
    const file = files.next();
    return SpreadsheetApp.openById(file.getId());
  }

  // Jika belum ada, buat spreadsheet baru dan tempatkan di folder ADNA Moments
  const newSs = SpreadsheetApp.create(SPREADSHEET_DB_NAME);
  const ssFile = DriveApp.getFileById(newSs.getId());
  moveFileToFolder(ssFile, rootFolder);

  // Inisialisasi sheet BucketList
  const sheet = getOrCreateSheet(newSs, "BucketList", [
    "id", "title", "category", "targetDate", "completed", "completedDate", "notes", "photoUrl", "photoId", "albumId", "createdAt", "updatedAt"
  ]);

  // Data awal romantis
  const nowIso = new Date().toISOString();
  const defaultDreams = [
    ["bl_init_1", "Liburan Romantis Berdua ke Pantai Sunset", "travel", "", "FALSE", "", "Menikmati semilir angin laut dan senja jingga berdua.", "", "", "", nowIso, nowIso],
    ["bl_init_2", "Makan Malam Spesial Candlelight Dinner", "date", "", "FALSE", "", "Quality time berbicara tentang segala hal diiringi musik lembut.", "", "", "", nowIso, nowIso],
    ["bl_init_3", "Mencoba Aktivitas Memasak Resep Baru Berdua", "fun", "", "FALSE", "", "Eksperimen di dapur bersama dengan tawa dan cinta.", "", "", "", nowIso, nowIso],
    ["bl_init_4", "Mewujudkan Rumah & Masa Depan Bahagia", "milestone", "", "FALSE", "", "Saling bergandengan tangan menatap masa depan yang kita bangun.", "", "", "", nowIso, nowIso]
  ];

  for (let r = 0; r < defaultDreams.length; r++) {
    sheet.appendRow(defaultDreams[r]);
  }

  return newSs;
}

/**
 * Fungsi uji coba untuk verifikasi spreadsheet langsung dari Editor Google Apps Script
 */
function testDatabaseSetup() {
  const ss = getOrCreateDatabaseSpreadsheet();
  Logger.log("✅ Spreadsheet Database berhasil diinisialisasi: " + ss.getName() + " (" + ss.getUrl() + ")");
}

/**
 * Mendapatkan sheet berdasarkan nama atau membuatnya jika belum ada
 */
function getOrCreateSheet(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  } else {
    // Pastikan header lengkap jika ada kolom baru (misal albumId)
    if (headers && headers.length > 0) {
      const lastCol = sheet.getLastColumn();
      if (lastCol > 0) {
        const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
        for (let i = 0; i < headers.length; i++) {
          if (existingHeaders.indexOf(headers[i]) === -1) {
            const nextCol = existingHeaders.length + 1;
            sheet.getRange(1, nextCol).setValue(headers[i]).setFontWeight("bold");
            existingHeaders.push(headers[i]);
          }
        }
      }
    }
  }
  return sheet;
}

/**
 * Membaca semua baris data dari sheet menjadi array of object JSON
 */
function getSheetRecords(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0].map(function(h) { return String(h).trim(); });
  const records = [];

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const rowObj = {};
    let hasData = false;

    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      let val = row[c];
      if (key === "completed") {
        val = String(val).toUpperCase() === "TRUE" || val === true;
      } else if (val instanceof Date) {
        val = val.toISOString().split("T")[0];
      } else {
        val = String(val || "");
      }
      rowObj[key] = val;
      if (val) hasData = true;
    }

    if (hasData && rowObj.id) {
      records.push(rowObj);
    }
  }

  // Urutkan: impian yang belum selesai di atas, lalu berdasarkan createdAt descending
  records.sort(function(a, b) {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  return records;
}

/**
 * Menghapus file secara permanen dari Google Drive
 */
function permanentlyDeleteDriveFile(fileId) {
  try {
    if (typeof Drive !== "undefined" && Drive.Files && typeof Drive.Files.remove === "function") {
      Drive.Files.remove(fileId);
      return;
    }
  } catch (err) {
    console.warn("Drive.Files.remove gagal, menggunakan setTrashed: " + err);
  }
  const file = DriveApp.getFileById(fileId);
  file.setTrashed(true);
}

/**
 * Menghapus folder album dan seluruh file di dalamnya secara permanen
 */
function permanentlyDeleteDriveFolder(folderId) {
  const folder = DriveApp.getFolderById(folderId);

  // 1. Hapus seluruh file di dalam folder secara permanen
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    permanentlyDeleteDriveFile(f.getId());
  }

  // 2. Hapus subfolder jika ada
  const subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    const sf = subfolders.next();
    permanentlyDeleteDriveFolder(sf.getId());
  }

  // 3. Hapus folder itu sendiri
  try {
    if (typeof Drive !== "undefined" && Drive.Files && typeof Drive.Files.remove === "function") {
      Drive.Files.remove(folderId);
      return;
    }
  } catch (err) {
    console.warn("Drive.Files.remove folder gagal, menggunakan setTrashed: " + err);
  }
  folder.setTrashed(true);
}
