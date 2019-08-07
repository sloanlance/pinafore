// A store where you can divide data into "realms" that are backed with an LRU cache.
// Each realm has self-contained data that you can set with setForRealm() and compute
// with computeForRealm(). The maxSize determines how many realms to keep in the LRU cache.
import { Store } from 'svelte/store.js'
import QuickLRU from 'quick-lru'
import { mark, stop } from './marks'
import { requestPostAnimationFrame } from './requestPostAnimationFrame'

export class RealmStore extends Store {
  constructor (init, maxSize) {
    super(init)
    this.set({ realms: new QuickLRU({ maxSize: maxSize }) })
    this._batches = {}
  }

  setCurrentRealm (realm) {
    this.set({ currentRealm: realm })
  }

  setForRealm (obj) {
    const { currentRealm, realms } = this.get()
    realms.set(currentRealm, Object.assign(realms.get(currentRealm) || {}, obj))
    this.set({ realms: realms })
  }

  computeForRealm (key, defaultValue) {
    this.compute(key,
      ['realms', 'currentRealm'],
      (realms, currentRealm) => {
        const realmData = realms.get(currentRealm)
        return (realmData && realmData[key]) || defaultValue
      })
  }

  /*
   * Update several values at once in a realm, assuming the key points
   * to a plain old javascript object.
   */
  batchUpdateForRealm (key, subKey, value) {
    const { currentRealm } = this.get()
    let realmBatches = this._batches[currentRealm]
    if (!realmBatches) {
      realmBatches = this._batches[currentRealm] = {}
    }
    let batch = realmBatches[key]
    if (!batch) {
      batch = realmBatches[key] = {}
    }
    batch[subKey] = value

    requestPostAnimationFrame(() => {
      const batch = this._batches[currentRealm] && this._batches[currentRealm][key]
      if (!batch) {
        return
      }
      const updatedKeys = Object.keys(batch)
      if (!updatedKeys.length) {
        return
      }
      mark('batchUpdate')
      const obj = this.get()[key]
      for (const otherKey of updatedKeys) {
        obj[otherKey] = batch[otherKey]
      }
      delete this._batches[currentRealm][key]
      const { realms } = this.get()
      realms.set(currentRealm, Object.assign(realms.get(currentRealm) || {}, { [key]: obj }))
      this.set({ realms: realms })
      stop('batchUpdate')
    })
  }
}
