const log = require('electron-log')
const { isValidAddress } = require('ethereumjs-util')

const signers = require('../../signers')
const windows = require('../../windows')
const store = require('../../store')

const Aragon = require('./aragon')

const capitalize = (s) => {
  if (typeof s !== 'string') return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

class Account {
  constructor ({ id, type, index, name, created, addresses, smart, options = {} }, accounts) {
    this.accounts = accounts
    this.id = id
    this.index = index || 0
    this.status = 'ok'
    this.name = name || capitalize(options.type) + ' Account'
    this.type = type || options.type
    this.created = created
    this.addresses = addresses || ['0x']
    this.smart = smart
    this.requests = {}
    if (this.smart && this.smart.type === 'aragon') this.aragon = new Aragon(this.smart)
    this.update(true)
    store.observer(() => {
      if (this.smart && this.smart.actor && this.smart.actor.id && this.smart.actor.id !== this.id) {
        this.smart.actor.account = store('main.accounts', this.smart.actor.id)
        this.signer = undefined
      }
      let updatedSigner = store('main.signers', this.id)
      if (this.signer && this.signer.status === 'locked' && updatedSigner && updatedSigner.status === 'ok') this.verifyAddress()
      this.signer = updatedSigner
      this.smart = this.signer ? undefined : this.smart
      this.update()
    })
  }
  addRequest (req) {
    let add = r => {
      this.requests[r.handlerId] = req
      this.requests[r.handlerId].mode = 'normal'
      this.requests[r.handlerId].created = Date.now()
      this.update()
      windows.showTray()
      windows.broadcast('main:action', 'setSignerView', 'default')
    }
    // Add a filter to make sure we're adding the request to an account that controls the outcome
    if (this.smart) {
      if (this.smart.type === 'aragon') {
        if (req.type === 'transaction') {
          if (!this.aragon) return log.error('Aragon account could not resolve this.aragon')
          let tx = this.validateTransaction(req.data)
          this.aragon.pathTransaction(tx, (err, tx) => {
            if (err) return log.error(err)
            req.data = tx
            add(req)
          })
        } else {
          add(req)
        }
      } else {
        add(req)
      }
    } else {
      add(req)
    }
  }
  verifyAddress (display) {
    if (this.smart && this.smart.actor && this.smart.actor.signer) {
      signers.get(this.smart.actor.signer.id).verifyAddress(this.index, this.smart.actor.addresses[this.index], display)
    } else if (this.signer) {
      signers.get(this.signer.id).verifyAddress(this.index, this.addresses[this.index], display)
    } else {
      log.info('No signer active to verify address')
    }
  }
  getSelectedAddresses () {
    return [this.addresses[this.index]]
  }
  getSelectedAddress () {
    return this.addresses[this.index]
  }
  setIndex (i, cb) {
    this.index = i
    this.requests = {} // TODO Decline these requests before clobbering them
    this.update()
    cb(null, this.summary())
    this.verifyAddress()
  }
  summary () {
    const update = JSON.parse(JSON.stringify({
      id: this.id,
      index: this.index,
      name: this.name,
      type: this.type,
      addresses: this.addresses,
      status: this.status,
      signer: this.signer,
      smart: this.smart,
      requests: this.requests
    }))
    if (update.smart && update.smart.actor && update.smart.actor.account) {
      update.signer = update.smart.actor.account.signer
      if (update.signer) update.signer.type = 'Agent'
    }
    return update
  }
  update (add) {
    this.accounts.update(this.summary(), add)
  }
  delete () {

  }
  getCoinbase (cb) {
    cb(null, this.addresses[0])
  }
  getAccounts (cb) {
    let account = this.addresses[this.index]
    if (cb) cb(null, account ? [account] : [])
    return account ? [account] : []
  }
  open () {
    windows.broadcast('main:action', 'addSigner', this.summary())
  }
  close () {
    console.log('Account close needs to remove observers')
  }
  signMessage (message, cb) {
    if (!message) return cb(new Error('No message to sign'))
    if (this.signer) {
      signers.get(this.signer.id).signMessage(this.index, message, cb)
    } else if (this.smart) {
      if (this.smart.actor && this.smart.actor.account && this.smart.actor.account.signer) {
        signers.get(this.smart.actor.account.id).signMessage(this.index, message, cb)
      } else {
        cb(new Error(`Agent's (${this.smart.agent}) signer is not ready`))
      }
    } else {
      cb(new Error(`No signer forund for this account`))
    }
  }
  signTransaction (rawTx, cb) {
    this._validateTransaction(rawTx, (err) => {
      if (err) return cb(err)

      if (this.signer) {
        signers.get(this.signer.id).signTransaction(this.index, rawTx, cb)
      } else if (this.smart) {
        if (this.smart.actor && this.smart.actor.account && this.smart.actor.account.signer) {
          signers.get(this.smart.actor.account.id).signTransaction(this.index, rawTx, cb)
        } else {
          cb(new Error(`Agent's (${this.smart.agent}) signer is not ready`))
        }
      } else {
        cb(new Error(`No signer forund for this account`))
      }
    })
  }
  _validateTransaction (rawTx, cb) {
    // Validate 'from' address
    if (!rawTx.from) return new Error(`Missing 'from' address`)
    if (!isValidAddress(rawTx.from)) return cb(new Error(`Invalid 'from' address`))

    // Ensure that transaction params are valid hex strings
    let keys = Object.keys(rawTx)
    for (let i = 0; i < keys.length; i++) {
      let key = keys[i]
      if (!this._isValidHexString(rawTx[key])) {
        // Break on first error
        cb(new Error(`Transaction parameter '${key}' is not a invalid hex string`))
        break
      }
    }
    return cb(null)
  }
  _isValidHexString (string) {
    const pattern = /^0x[0-9a-fA-F]*$/
    return pattern.test(string)
  }
}

module.exports = Account
