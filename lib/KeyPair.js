const blake2b = require('blake2b')
const nacl = require('tweetnacl')
const { Buffer } = require('buffer/index.js');
var crypto
var mnemonics = require('./mnemonics');
const bip39 = require('bip39');

const isBrowser = typeof window !== 'undefined' && window.hasOwnProperty('Window') && window instanceof window.Window;

if (isBrowser) {
  if (hasStrongRandom()) {
    crypto = window['crypto']
  } else {
    throw 'Error, you browser does not supports secure random generation.'
  }
} else {
  crypto = require('crypto')
}

function hasStrongRandom() {
	return 'crypto' in window && window['crypto'] !== null
}

// generates a secure 256 bit (32 byte) length random seed or returns false if fails
function generateRandomData (callback = null) {
  if (isBrowser) {
    // generate syncronously because browsers not supports async random generation
    var buffer = new Uint8Array(32)
    var randomData = crypto.getRandomValues(buffer)
    // call back callback if set
    if (callback != null) {
      callback(randomData)
      return
    }
  } else {
    // generate random with node
    if (callback != null) {
      // async randomBytes if callback is not null (works only in Node, browsers does not supports)
      crypto.randomBytes(32, (err, randomData) => {
        if (err) throw err
        callback(randomData)
        return
      })
    } else {
      //sync
      var randomData = crypto.randomBytes(32)
    }
  }
  return randomData
}

// generates an object with address, privateKey, and publicKey from the given seed
function generateFromSeed (seed) {
  var arr = blake2b(32).update(seed).digest()
  var keypair = nacl.sign.keyPair.fromSeed(arr.slice(0, 32))
  return deriveAddress(Buffer.from(keypair.secretKey).toString('hex'))
}

// generates keypairs from mnemonic. First index: [0,0,0,0,0,0,0,0]
function generateFromMnemonic (phrase, index) {
  var seed = Buffer.from(bip39.mnemonicToEntropy(phrase),'hex');
  seed = blake2b(32).update(Buffer.from(seed,'hex')).digest();
  var arr = blake2b(32).update(seed).update(index).digest();
  var keypair = nacl.sign.keyPair.fromSeed(arr.slice(0, 32))
  return deriveAddress(Buffer.from(keypair.secretKey).toString('hex'))
}

function deriveAddress (privateKey) {
  // generate blake2 hash
  var keypair = nacl.sign.keyPair.fromSecretKey(Buffer.from(privateKey, 'hex'))
  // port of StandardAddress function.
  //   |
  //   V
  // algo variable (ed25519 + 9 zero bytes)
  var Algorithm = 'ed25519'
  var buf = new Array(65).fill(0)
  // add algo variable to array
  for (var i = 0; i < Algorithm.length; i++) {
    buf[i + 1] = Algorithm.charCodeAt(i)
  }
  // add public key length to buffer
  buf[17] = keypair.publicKey.length
  for (var i = 0; i < keypair.publicKey.length; i++) {
    buf[i + 25] = keypair.publicKey[i]
  }
  // get public key as array with length 32
  var pubkeyHash = blake2b(32).update(buf.slice(0, 57)).digest()

  const timelockhash = [
    0x51, 0x87, 0xb7, 0xa8, 0x02, 0x1b, 0xf4, 0xf2,
    0xc0, 0x04, 0xea, 0x3a, 0x54, 0xcf, 0xec, 0xe1,
    0x75, 0x4f, 0x11, 0xc7, 0x62, 0x4d, 0x23, 0x63,
    0xc7, 0xf4, 0xcf, 0x4f, 0xdd, 0xd1, 0x44, 0x1e
  ]
  const sigsrequiredHash = [
    0xb3, 0x60, 0x10, 0xeb, 0x28, 0x5c, 0x15, 0x4a,
    0x8c, 0xd6, 0x30, 0x84, 0xac, 0xbe, 0x7e, 0xac,
    0x0c, 0x4d, 0x62, 0x5a, 0xb4, 0xe1, 0xa7, 0x6e,
    0x62, 0x4a, 0x87, 0x98, 0xcb, 0x63, 0x49, 0x7b
  ]

  // merkle tree node prefix
  buf[0] = 0x01
  // add timelock hash to buffer at position 1 (overwriting algo data)
  for (var i = 0; i < timelockhash.length; i++) {
    buf[i + 1] = timelockhash[i]
  }
  // fill out the rest of the buffer with the pubkey
  for (var i = 0; i < pubkeyHash.length; i++) {
    buf[i + 33] = pubkeyHash[i]
  }
  // tlpk hash as array with length 32
  var tlpkHash = blake2b(32).update(buf).digest()
  // populate buffer from posiiton 1 with tlpkhash
  for (var i = 0; i < tlpkHash.length; i++) {
    buf[i + 1] = tlpkHash[i]
  }
  // populate rest of buffer with sigsrequiredHash
  for (var i = 0; i < sigsrequiredHash.length; i++) {
    buf[i + 33] = sigsrequiredHash[i]
  }
  // encode address as array with length 32
  var unlockhashArr = blake2b(32).update(buf).digest()
  var unlockhash = blake2b(32).update(buf).digest('hex')
  var checksum = blake2b(32).update(unlockhashArr).digest('hex')
  var address = unlockhash + checksum.slice(0, 12)
  var privateKey = ''
  for (var i = 0; i < keypair.secretKey.length; i++) {
    privateKey += String.fromCharCode(keypair.secretKey[i])
  }
  return {
    address,
    publicKey: Buffer.from(keypair.publicKey).toString('hex'),
    privateKey: Buffer.from(keypair.secretKey).toString('hex')
  }
}

function deriveAddressByHexPublicKey (hexPublicKey) {
  const publicKey = Buffer.from(hexPublicKey, 'hex');

  var Algorithm = 'ed25519'
  var buf = new Array(65).fill(0)
  // add algo variable to array
  for (var i = 0; i < Algorithm.length; i++) {
    buf[i + 1] = Algorithm.charCodeAt(i)
  }
  // add public key length to buffer
  buf[17] = publicKey.length
  for (var i = 0; i < publicKey.length; i++) {
    buf[i + 25] = publicKey[i]
  }
  // get public key as array with length 32
  var pubkeyHash = blake2b(32).update(buf.slice(0, 57)).digest()

  const timelockhash = [
    0x51, 0x87, 0xb7, 0xa8, 0x02, 0x1b, 0xf4, 0xf2,
    0xc0, 0x04, 0xea, 0x3a, 0x54, 0xcf, 0xec, 0xe1,
    0x75, 0x4f, 0x11, 0xc7, 0x62, 0x4d, 0x23, 0x63,
    0xc7, 0xf4, 0xcf, 0x4f, 0xdd, 0xd1, 0x44, 0x1e
  ]
  const sigsrequiredHash = [
    0xb3, 0x60, 0x10, 0xeb, 0x28, 0x5c, 0x15, 0x4a,
    0x8c, 0xd6, 0x30, 0x84, 0xac, 0xbe, 0x7e, 0xac,
    0x0c, 0x4d, 0x62, 0x5a, 0xb4, 0xe1, 0xa7, 0x6e,
    0x62, 0x4a, 0x87, 0x98, 0xcb, 0x63, 0x49, 0x7b
  ]

  // merkle tree node prefix
  buf[0] = 0x01
  // add timelock hash to buffer at position 1 (overwriting algo data)
  for (var i = 0; i < timelockhash.length; i++) {
    buf[i + 1] = timelockhash[i]
  }
  // fill out the rest of the buffer with the pubkey
  for (var i = 0; i < pubkeyHash.length; i++) {
    buf[i + 33] = pubkeyHash[i]
  }
  // tlpk hash as array with length 32
  var tlpkHash = blake2b(32).update(buf).digest()
  // populate buffer from posiiton 1 with tlpkhash
  for (var i = 0; i < tlpkHash.length; i++) {
    buf[i + 1] = tlpkHash[i]
  }
  // populate rest of buffer with sigsrequiredHash
  for (var i = 0; i < sigsrequiredHash.length; i++) {
    buf[i + 33] = sigsrequiredHash[i]
  }
  // encode address as array with length 32
  var unlockhashArr = blake2b(32).update(buf).digest()
  var unlockhash = blake2b(32).update(buf).digest('hex')
  var checksum = blake2b(32).update(unlockhashArr).digest('hex')
  var address = unlockhash + checksum.slice(0, 12)

  return {
    address
  }
}

// generates a public key from a given private key
function publicKeyFromPrivateKey (privateKey) {
  var keypair = nacl.sign.keyPair.fromSecretKey(Buffer.from(privateKey, 'hex'))
  return Buffer.from(keypair.publicKey).toString('hex')
}

// generates a KeyPair from/with salt
function generateSaltString (salt = null, saltLength = 32) {
  if(salt === null) {
    salt = _generateRandomSalt(saltLength);
  }
  const mnemonicPhrase = mnemonics.bytesToMnemonic(salt);
  const entropy = mnemonics.mnemonicToBytes(mnemonicPhrase);
  const buffer = new Buffer(40);
  buffer.set(entropy);
  buffer.writeBigUInt64LE(0n, 32);
  const keyPair = generateFromSeed(buffer);
  const result = {
      "address": keyPair.address,
      "publicKey": keyPair.publicKey,
      "privateKey": keyPair.privateKey,
      "seed": mnemonicPhrase,
      "salt": salt
  }
  return result;
}

function _generateRandomSalt (length) {
  let result = '';
  const characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for ( let i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

module.exports = {
  generateRandomData,
  generateFromSeed,
  generateSaltString,
  deriveAddress,
  deriveAddressByHexPublicKey,
  publicKeyFromPrivateKey,
  generateFromMnemonic
}
