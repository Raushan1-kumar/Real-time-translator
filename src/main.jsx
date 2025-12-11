import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import WebRTCGroup from './WebRTC.jsx'
import WebRTCWithTranslation from './NewWebrtcWithTranslation.jsx'
import WebRTC from './PreviousWeb.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* <App /> */}
    {/* <WebRTCGroup/> */}
    {/* <WebRTC/> */}
    <WebRTCWithTranslation/>
  </StrictMode>,
)
 