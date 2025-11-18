import "./App.css";
import WebRTCPlayer from "./webrtc.player.tsx";

function App() {
  return (
    <>
      <WebRTCPlayer streamName='akuvox' />
    </>
  );
}

export default App;
