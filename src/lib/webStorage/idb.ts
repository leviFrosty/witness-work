export const transactionDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () =>
      reject(tx.error ?? new Error('IndexedDB transaction failed'))
  })
