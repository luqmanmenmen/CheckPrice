/* eslint-disable no-restricted-globals */
/**
 * offline-sync-worker.js
 * =============================================================================
 * Turbo Multi-Worker Offline Sync Engine untuk SukoScannerDB (IndexedDB)
 * - Mode "master":
 *   1. Parallel Fetch Pool (hingga 8 koneksi serentak + auto-retry 2x/chunk)
 *   2. Native GZIP Decompression (DecompressionStream) + JSON.parse di luar Main Thread
 *   3. Spawn Pool 4-6 Sub-Worker (CPU Parallel Decode + Native IDB { durability: "relaxed" })
 *      dengan Dynamic Work-Stealing Queue (RAM irit + anti-freeze 60 FPS)
 *   4. Paralel 3 Object Store sekaligus: `products`, `models`, dan `aliases`
 *   5. Fallback otomatis ke 3-Store Parallel Native IDB jika nested Worker tak tersedia
 * - Mode "sub-writer":
 *   Worker khusus decode tuple Python -> objek & commit native IDB relaxed transaction
 * =============================================================================
 */

function getDict(arr, idx) {
  return typeof idx === "number" && idx >= 0 && arr && idx < arr.length ? arr[idx] : null;
}

function decodeImg(raw, imgPrefix) {
  if (!raw) return null;
  return raw.charCodeAt(0) === 126 /* '~' */ ? imgPrefix + raw.slice(1) : raw;
}

function openIdb(dbName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Gagal membuka IndexedDB di Worker"));
  });
}

function createRelaxedTx(idb, storeNames) {
  try {
    return idb.transaction(storeNames, "readwrite", { durability: "relaxed" });
  } catch {
    return idb.transaction(storeNames, "readwrite");
  }
}

function clearStoresParallel(idb, storeNames) {
  return new Promise((resolve, reject) => {
    const existing = storeNames.filter((s) => idb.objectStoreNames.contains(s));
    if (existing.length === 0) {
      resolve();
      return;
    }
    const tx = createRelaxedTx(idb, existing);
    for (let i = 0; i < existing.length; i++) {
      tx.objectStore(existing[i]).clear();
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Gagal membersihkan object store"));
    tx.onabort = () => reject(tx.error || new Error("Transaksi clear dibatalkan"));
  });
}

function writeProductsSliceIdb(idb, rows, dicts, imgPrefix) {
  return new Promise((resolve, reject) => {
    const tx = createRelaxedTx(idb, ["products"]);
    const store = tx.objectStore("products");
    const brands = dicts.brands;
    const depts = dicts.depts;
    const discounts = dicts.discounts;
    const discountTypes = dicts.discountTypes;
    const acaras = dicts.acaras;
    const toDates = dicts.toDates;

    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      const desc = r[3] || "";
      const colonIdx = desc.indexOf(":");
      store.put({
        sku: r[0],
        barcode: r[1] || null,
        article: r[2] || null,
        name: colonIdx > 0 ? desc.slice(0, colonIdx).trim() : desc,
        description: desc,
        brand: getDict(brands, r[4]),
        dept: getDict(depts, r[5]),
        color: r[6] || "",
        size: r[7] || "",
        hargaNormal: r[8] ?? 0,
        hargaPromo: r[9] ?? null,
        diskon: getDict(discounts, r[10]),
        discountType: getDict(discountTypes, r[11]),
        acara: getDict(acaras, r[12]),
        stok: r[13] ?? 0,
        toDate: getDict(toDates, r[14]),
        imageUrl: decodeImg(r[15], imgPrefix),
      });
    }

    tx.oncomplete = () => resolve(rows.length);
    tx.onerror = () => reject(tx.error || new Error("Gagal menulis batch products"));
    tx.onabort = () => reject(tx.error || new Error("Transaksi products dibatalkan"));
  });
}

function writeModelsSliceIdb(idb, rows, dicts, imgPrefix) {
  return new Promise((resolve, reject) => {
    if (!idb.objectStoreNames.contains("models")) {
      resolve(0);
      return;
    }
    const tx = createRelaxedTx(idb, ["models"]);
    const store = tx.objectStore("models");
    const brands = dicts.brands;
    const depts = dicts.depts;
    const brandGroups = dicts.brandGroups;
    const subBrands = dicts.subBrands;
    const catKeys = dicts.catKeys;
    const discounts = dicts.discounts;
    const discountTypes = dicts.discountTypes;
    const acaras = dicts.acaras;
    const toDates = dicts.toDates;

    for (let i = 0; i < rows.length; i++) {
      const m = rows[i];
      store.put({
        key: m[0],
        sku: m[1],
        barcode: m[2] || null,
        article: m[3] || null,
        description: m[4] || "",
        brand: getDict(brands, m[5]),
        dept: getDict(depts, m[6]),
        brandGroup: getDict(brandGroups, m[7]) || "MUKU",
        subBrand: getDict(subBrands, m[8]) || undefined,
        categoryKey: getDict(catKeys, m[9]) || "OTHER",
        color: m[10] || null,
        size: m[11] || null,
        stok: m[12] ?? 0,
        hargaNormal: m[13] ?? 0,
        hargaPromo: m[14] ?? null,
        diskon: getDict(discounts, m[15]),
        discountType: getDict(discountTypes, m[16]),
        acara: getDict(acaras, m[17]),
        toDate: getDict(toDates, m[18]),
        imageUrl: decodeImg(m[19], imgPrefix),
        articleGroupCount: m[20] ?? 1,
        articleTotalStok: m[21] ?? 0,
        articleColors: Array.isArray(m[22]) ? m[22] : [],
        articleSizes: Array.isArray(m[23]) ? m[23] : [],
        articleHasPromo: Boolean(m[24]),
        articlePromoLabel: m[25] || null,
      });
    }

    tx.oncomplete = () => resolve(rows.length);
    tx.onerror = () => reject(tx.error || new Error("Gagal menulis batch models"));
    tx.onabort = () => reject(tx.error || new Error("Transaksi models dibatalkan"));
  });
}

function writeAliasesSliceIdb(idb, rows) {
  return new Promise((resolve, reject) => {
    if (!idb.objectStoreNames.contains("aliases")) {
      resolve(0);
      return;
    }
    const tx = createRelaxedTx(idb, ["aliases"]);
    const store = tx.objectStore("aliases");
    for (let i = 0; i < rows.length; i++) {
      const a = rows[i];
      store.put({
        barcode: a[0],
        barcodeNorm: a[1],
        sku: a[2],
      });
    }
    tx.oncomplete = () => resolve(rows.length);
    tx.onerror = () => reject(tx.error || new Error("Gagal menulis batch aliases"));
    tx.onabort = () => reject(tx.error || new Error("Transaksi aliases dibatalkan"));
  });
}

// ── STATE UNTUK MODE SUB-WRITER ──────────────────────────────────────────────
let subState = {
  idb: null,
  dicts: null,
  imgPrefix: "",
};

async function handleSubWriterMessage(data) {
  try {
    if (data.cmd === "init") {
      subState.dicts = data.dicts || {};
      subState.imgPrefix = data.imgPrefix || "";
      subState.idb = await openIdb(data.dbName || "SukoScannerDB");
      self.postMessage({ type: "ready" });
      return;
    }

    if (data.cmd === "write_products") {
      const n = await writeProductsSliceIdb(subState.idb, data.rows, subState.dicts, subState.imgPrefix);
      self.postMessage({ type: "batch_done", taskId: data.taskId, kind: "products", count: n });
      return;
    }

    if (data.cmd === "write_models_aliases") {
      const tasks = [];
      if (Array.isArray(data.models) && data.models.length > 0) {
        tasks.push(
          (async () => {
            const STEP = 15000;
            for (let i = 0; i < data.models.length; i += STEP) {
              await writeModelsSliceIdb(subState.idb, data.models.slice(i, i + STEP), subState.dicts, subState.imgPrefix);
            }
          })()
        );
      }
      if (Array.isArray(data.aliases) && data.aliases.length > 0) {
        tasks.push(
          (async () => {
            const STEP = 20000;
            for (let i = 0; i < data.aliases.length; i += STEP) {
              await writeAliasesSliceIdb(subState.idb, data.aliases.slice(i, i + STEP));
            }
          })()
        );
      }
      await Promise.all(tasks);
      self.postMessage({
        type: "batch_done",
        taskId: data.taskId,
        kind: "models_aliases",
        count: (data.models?.length || 0) + (data.aliases?.length || 0),
      });
      return;
    }

    if (data.cmd === "close") {
      if (subState.idb) {
        try {
          subState.idb.close();
        } catch {}
        subState.idb = null;
      }
      self.close();
    }
  } catch (err) {
    self.postMessage({
      type: "sub_error",
      taskId: data.taskId,
      error: err?.message || String(err),
    });
  }
}

// ── FETCH PARALEL DENGAN AUTO-RETRY ──────────────────────────────────────────
async function fetchChunkWithRetry(url, retries = 2) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, { cache: "force-cache" });
      if (r.ok) {
        return await r.arrayBuffer();
      }
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < retries) {
      await new Promise((res) => setTimeout(res, 350 * (attempt + 1)));
    }
  }
  throw lastErr || new Error("Gagal unduh chunk snapshot");
}

async function runMasterSync(cfg) {
  const t0 = Date.now();
  const {
    snapshotUrl,
    snapshotChunkCount,
    knownTotal,
    knownGzipBytes,
    dbName = "SukoScannerDB",
    workerCount = 6,
    workerScriptUrl,
  } = cfg;

  const activeSubWorkers = [];
  let masterIdb = null;

  const postProgress = (rawPercent, downloadedSkus, totalSkus, etaSeconds, statusText, stage, activeWorkers) => {
    self.postMessage({
      type: "progress",
      rawPercent,
      downloadedSkus,
      totalSkus,
      etaSeconds,
      statusText,
      stage,
      activeWorkers,
    });
  };

  try {
    const dlWorkers = Math.max(2, Math.min(8, snapshotChunkCount || 6));
    postProgress(
      6,
      0,
      knownTotal,
      null,
      `Mengunduh paket katalog (${dlWorkers} jalur paralel)...`,
      "downloading",
      dlWorkers
    );

    let gzBlob;

    if (snapshotUrl.startsWith("/api/storage/") && snapshotChunkCount > 1) {
      const orderedParts = new Array(snapshotChunkCount);
      let loadedBytes = 0;
      let nextChunkIdx = 0;
      const totalBytes = knownGzipBytes > 0 ? knownGzipBytes : snapshotChunkCount * 1_500_000;
      const sep = snapshotUrl.includes("?") ? "&" : "?";

      const runDownloadLane = async () => {
        while (true) {
          const idx = nextChunkIdx++;
          if (idx >= snapshotChunkCount) break;
          const ab = await fetchChunkWithRetry(`${snapshotUrl}${sep}chunk=${idx}`, 2);
          orderedParts[idx] = ab;
          loadedBytes += ab.byteLength;
          const mbDone = (loadedBytes / (1024 * 1024)).toFixed(1);
          const mbTot = (totalBytes / (1024 * 1024)).toFixed(1);
          const dlRatio = Math.min(0.99, loadedBytes / Math.max(1, totalBytes));
          const elapsed = Math.max(0.2, (Date.now() - t0) / 1000);
          const eta = dlRatio > 0.08 ? Math.max(1, elapsed / dlRatio - elapsed + 5) : null;
          postProgress(
            6 + dlRatio * 28,
            Math.round(knownTotal * dlRatio * 0.2),
            knownTotal,
            eta,
            `Unduh paralel (${dlWorkers} jalur): ${mbDone} / ${mbTot} MB`,
            "downloading",
            dlWorkers
          );
        }
      };

      const lanes = [];
      for (let w = 0; w < dlWorkers; w++) {
        lanes.push(runDownloadLane());
      }
      await Promise.all(lanes);
      gzBlob = new Blob(orderedParts);
    } else {
      const res = await fetch(snapshotUrl, { cache: "force-cache" });
      if (!res.ok) throw new Error(`Snapshot HTTP ${res.status}`);
      const totalBytes = Number(res.headers.get("content-length") || knownGzipBytes || 0);
      if (res.body && typeof res.body.getReader === "function") {
        const reader = res.body.getReader();
        const chunks = [];
        let loadedBytes = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loadedBytes += value.byteLength;
            const mbDone = (loadedBytes / (1024 * 1024)).toFixed(1);
            const mbTot = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) : "?";
            const dlRatio = totalBytes > 0 ? Math.min(0.99, loadedBytes / totalBytes) : 0.5;
            const elapsed = Math.max(0.2, (Date.now() - t0) / 1000);
            const eta = totalBytes > 0 && dlRatio > 0.08 ? Math.max(1, elapsed / dlRatio - elapsed + 5) : null;
            postProgress(
              6 + dlRatio * 28,
              Math.round(knownTotal * dlRatio * 0.2),
              knownTotal,
              eta,
              `Unduh snapshot Python: ${mbDone} / ${mbTot} MB`,
              "downloading",
              1
            );
          }
        }
        gzBlob = new Blob(chunks);
      } else {
        gzBlob = await res.blob();
      }
    }

    // 2. Dekompresi Native GZIP + JSON Parse 100% di Background Worker
    postProgress(36, 0, knownTotal, 6, "Membuka paket terkompresi di Worker...", "indexing", workerCount);
    const decompressedStream = gzBlob.stream().pipeThrough(new DecompressionStream("gzip"));
    const jsonText = await new Response(decompressedStream).text();
    gzBlob = null; // Lepas memori blob segera!

    postProgress(40, 0, knownTotal, 5, "Mengurai indeks katalog & menyiapkan Worker...", "indexing", workerCount);
    const bundle = JSON.parse(jsonText);

    if (!bundle || !Array.isArray(bundle.products) || bundle.products.length < 1000) {
      throw new Error("Bundle snapshot kosong atau tidak valid");
    }

    const dicts = bundle.dicts || {};
    const imgPrefix = bundle.imgPrefix || "";
    const rawProds = bundle.products;
    const rawModels = Array.isArray(bundle.models) ? bundle.models : [];
    const rawAliases = Array.isArray(bundle.aliases) ? bundle.aliases : [];
    const totalSkus = rawProds.length;

    // 3. Bersihkan 3 object store serentak dalam 1 transaksi paralel
    masterIdb = await openIdb(dbName);
    await clearStoresParallel(masterIdb, ["products", "models", "aliases"]);

    const writeStart = Date.now();
    let savedSkus = 0;

    // Cek dukungan Nested Worker (Chrome, Edge, Android Chrome, Safari 15.5+)
    const canSpawnNested = typeof Worker !== "undefined" && Boolean(workerScriptUrl);
    const desiredPool = Math.max(4, Math.min(6, Number(workerCount) || 6));

    if (canSpawnNested) {
      const spawnSub = () =>
        new Promise((resolve, reject) => {
          const w = new Worker(workerScriptUrl);
          activeSubWorkers.push(w);
          const onFirstMsg = (ev) => {
            if (ev.data?.type === "ready") {
              w.removeEventListener("message", onFirstMsg);
              resolve(w);
            } else if (ev.data?.type === "sub_error") {
              w.removeEventListener("message", onFirstMsg);
              reject(new Error(ev.data.error));
            }
          };
          w.addEventListener("message", onFirstMsg);
          w.onerror = (e) => reject(new Error(e.message || "Sub-worker error"));
          w.postMessage({ mode: "sub-writer", cmd: "init", dbName, dicts, imgPrefix });
        });

      const subWorkers = await Promise.all(
        Array.from({ length: desiredPool }, () => spawnSub())
      );

      // Worker 0 khusus mengerjakan `models` + `aliases` PARALEL berbarengan dengan `products`!
      const metaWorker = subWorkers[0];
      const productWorkers = subWorkers.slice(1);
      const totalActive = subWorkers.length;

      const metaPromise = new Promise((resolve, reject) => {
        if (rawModels.length === 0 && rawAliases.length === 0) {
          resolve(0);
          return;
        }
        const onMsg = (ev) => {
          if (ev.data?.type === "batch_done" && ev.data?.kind === "models_aliases") {
            metaWorker.removeEventListener("message", onMsg);
            resolve(ev.data.count || 0);
          } else if (ev.data?.type === "sub_error") {
            metaWorker.removeEventListener("message", onMsg);
            reject(new Error(ev.data.error));
          }
        };
        metaWorker.addEventListener("message", onMsg);
        metaWorker.postMessage({
          mode: "sub-writer",
          cmd: "write_models_aliases",
          taskId: "meta",
          models: rawModels,
          aliases: rawAliases,
        });
      });

      // Dynamic Work-Stealing Queue untuk `products` lintas semua productWorkers!
      const PROD_BATCH = 20000;
      const slices = [];
      for (let i = 0; i < totalSkus; i += PROD_BATCH) {
        slices.push({ id: i, start: i, end: Math.min(i + PROD_BATCH, totalSkus) });
      }
      let nextSliceIdx = 0;

      const runProductWorker = (w) =>
        new Promise((resolve, reject) => {
          const dispatchNext = () => {
            const idx = nextSliceIdx++;
            if (idx >= slices.length) {
              w.removeEventListener("message", onMsg);
              resolve();
              return;
            }
            const sl = slices[idx];
            w.postMessage({
              mode: "sub-writer",
              cmd: "write_products",
              taskId: sl.id,
              rows: rawProds.slice(sl.start, sl.end),
            });
          };

          const onMsg = (ev) => {
            if (ev.data?.type === "batch_done" && ev.data?.kind === "products") {
              savedSkus += ev.data.count || 0;
              const elapsedWrite = Math.max(0.2, (Date.now() - writeStart) / 1000);
              const wRatio = Math.min(0.99, savedSkus / totalSkus);
              const etaWrite = wRatio > 0.05 ? Math.max(1, elapsedWrite / wRatio - elapsedWrite + 1) : null;
              postProgress(
                42 + wRatio * 52,
                savedSkus,
                totalSkus,
                etaWrite,
                `Memasang ${savedSkus.toLocaleString("id-ID")} / ${totalSkus.toLocaleString("id-ID")} SKU (${totalActive} Worker)...`,
                "indexing",
                totalActive
              );
              dispatchNext();
            } else if (ev.data?.type === "sub_error") {
              w.removeEventListener("message", onMsg);
              reject(new Error(ev.data.error));
            }
          };

          w.addEventListener("message", onMsg);
          dispatchNext();
        });

      await Promise.all([
        metaPromise,
        ...productWorkers.map((w) => runProductWorker(w)),
      ]);
    } else {
      // Fallback bila browser tidak mendukung Nested Worker: tetap pakai 3-Store Parallel Native IDB Relaxed!
      const modelsPromise = (async () => {
        const STEP = 15000;
        for (let i = 0; i < rawModels.length; i += STEP) {
          await writeModelsSliceIdb(masterIdb, rawModels.slice(i, i + STEP), dicts, imgPrefix);
        }
      })();
      const aliasesPromise = (async () => {
        const STEP = 20000;
        for (let i = 0; i < rawAliases.length; i += STEP) {
          await writeAliasesSliceIdb(masterIdb, rawAliases.slice(i, i + STEP));
        }
      })();
      const productsPromise = (async () => {
        const PROD_BATCH = 25000;
        for (let i = 0; i < totalSkus; i += PROD_BATCH) {
          const slice = rawProds.slice(i, Math.min(i + PROD_BATCH, totalSkus));
          await writeProductsSliceIdb(masterIdb, slice, dicts, imgPrefix);
          savedSkus += slice.length;
          const elapsedWrite = Math.max(0.2, (Date.now() - writeStart) / 1000);
          const wRatio = Math.min(0.99, savedSkus / totalSkus);
          const etaWrite = wRatio > 0.05 ? Math.max(1, elapsedWrite / wRatio - elapsedWrite + 1) : null;
          postProgress(
            42 + wRatio * 52,
            savedSkus,
            totalSkus,
            etaWrite,
            `Memasang ${savedSkus.toLocaleString("id-ID")} / ${totalSkus.toLocaleString("id-ID")} SKU (Turbo IDB)...`,
            "indexing",
            3
          );
        }
      })();

      await Promise.all([modelsPromise, aliasesPromise, productsPromise]);
    }

    const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
    self.postMessage({
      type: "complete",
      savedSkus,
      modelsCount: rawModels.length,
      aliasesCount: rawAliases.length,
      elapsedSec,
    });
  } catch (err) {
    self.postMessage({
      type: "error",
      error: err?.message || String(err),
    });
  } finally {
    for (let i = 0; i < activeSubWorkers.length; i++) {
      try {
        activeSubWorkers[i].postMessage({ mode: "sub-writer", cmd: "close" });
        activeSubWorkers[i].terminate();
      } catch {}
    }
    if (masterIdb) {
      try {
        masterIdb.close();
      } catch {}
    }
  }
}

self.onmessage = (event) => {
  const data = event.data || {};
  if (data.mode === "sub-writer") {
    handleSubWriterMessage(data);
  } else if (data.mode === "master") {
    runMasterSync(data);
  }
};
