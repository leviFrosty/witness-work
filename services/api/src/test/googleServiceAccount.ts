/** A throwaway RSA service account for exercising the JWT-bearer exchange. */
export const createTestServiceAccount = async (
  projectId = 'ww-test-project'
): Promise<{
  json: string
  publicKey: CryptoKey
}> => {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair
  const pkcs8 = new Uint8Array(
    (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer
  )
  let binary = ''
  for (const byte of pkcs8) binary += String.fromCharCode(byte)
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----\n`
  return {
    json: JSON.stringify({
      type: 'service_account',
      project_id: projectId,
      client_email: 'play-integrity@example.iam.gserviceaccount.com',
      private_key: pem,
      token_uri: 'https://attacker.example/token',
    }),
    publicKey: pair.publicKey,
  }
}
