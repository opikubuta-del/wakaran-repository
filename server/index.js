import app, { localPort } from './app.js'

app.listen(localPort, () => {
  console.log(`API listening on http://localhost:${localPort}`)
})
