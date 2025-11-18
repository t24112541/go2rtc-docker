import { useEffect, useRef, useState } from "react";
import axios from "axios";

const config = {
  url: "",
  credential: {
    client_id: "",
    client_secret: "",
  },
};

function WebrtcPlayer({ streamName = "akuvox" }) {
  const ws = useRef<WebSocket | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [status, setStatus] = useState<
    "connecting" | "connected" | "streaming" | "error"
  >("connecting");
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    let isMounted = true;

    const connect = async () => {
      const { url, credential } = config;
      setIsLoading(true);

      try {
        const result = await axios.post(`https://${url}/auth`, {
          client_id: credential.client_id,
          client_secret: credential.client_secret,
        });

        const token = result.data.code;
        if (!isMounted) return;

        cleanup(); // important

        ws.current = new WebSocket(
          `wss://${url}/api/ws?src=${streamName}&token=${token}`
        );

        ws.current.onopen = () => {
          setStatus("connected");
          reconnectAttempts.current = 0;
          startWebRTC();
        };

        ws.current.onmessage = onMessage;
        ws.current.onerror = () => setStatus("error");

        ws.current.onclose = () => {
          if (!isMounted) return;

          if (reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current++;
            setTimeout(connect, 2000);
          } else {
            setStatus("error");
          }
        };
      } catch (err) {
        console.error("Auth failed", err);
        setStatus("error");
      }
    };

    const onMessage = async (event: MessageEvent) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "webrtc/answer" && pc.current) {
        await pc.current.setRemoteDescription(
          new RTCSessionDescription({ sdp: msg.value, type: "answer" })
        );
      }

      if (msg.type === "webrtc/candidate" && pc.current) {
        await pc.current.addIceCandidate(
          new RTCIceCandidate({ candidate: msg.value, sdpMid: "0" })
        );
      }
    };

    const startWebRTC = async () => {
      cleanupPC();

      pc.current = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      console.log("---------------pc.current", pc.current);

      pc.current.ontrack = (event) => {
        console.log("OnTrack event received:", event);
        console.log("Stream tracks:", event.streams[0].getTracks());

        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          setStatus("streaming");

          // Add video event listeners
          videoRef.current.onloadstart = () => {
            console.log("Video loading started");
            setIsLoading(true);
          };

          videoRef.current.onloadeddata = () => {
            console.log("Video data loaded");
            setIsLoading(false);
          };

          videoRef.current.onloadedmetadata = () => {
            console.log("Video metadata loaded");
            setVideoLoaded(true);
          };

          videoRef.current.oncanplay = () => {
            console.log("Video can play");
            setIsLoading(false);
            videoRef.current?.play().catch(console.error);
          };

          videoRef.current.onwaiting = () => {
            console.log("Video waiting for data");
            setIsLoading(true);
          };

          videoRef.current.onplaying = () => {
            console.log("Video is playing");
            setIsLoading(false);
          };

          videoRef.current.onerror = (e) => {
            console.error("Video error:", e);
            setStatus("error");
            setIsLoading(false);
          };

          console.log("Video srcObject set successfully");
        } else {
          console.error("videoRef.current or stream is null");
        }
      };

      pc.current.onicecandidate = (event) => {
        if (event.candidate && ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(
            JSON.stringify({
              type: "webrtc/candidate",
              value: event.candidate.candidate,
            })
          );
        }
      };

      pc.current.onconnectionstatechange = () => {
        if (pc.current?.connectionState === "failed") {
          setStatus("error");
        }
      };

      const offer = await pc.current.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: false,
      });

      await pc.current.setLocalDescription(offer);

      // send offer only after ICE is gathered
      pc.current.onicegatheringstatechange = () => {
        if (
          pc.current?.iceGatheringState === "complete" &&
          ws.current?.readyState === WebSocket.OPEN
        ) {
          ws.current.send(
            JSON.stringify({
              type: "webrtc/offer",
              value: pc.current.localDescription?.sdp,
            })
          );
        }
      };
    };

    const cleanupPC = () => {
      if (pc.current) {
        pc.current.getSenders().forEach((s) => s.track?.stop());
        pc.current.close();
        pc.current = null;
      }
    };

    const cleanup = () => {
      ws.current?.close();
      ws.current = null;
      cleanupPC();
    };

    connect();

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [streamName]);

  console.log(
    "------------status:",
    status,
    "videoLoaded:",
    videoLoaded,
    "isLoading:",
    isLoading
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Loading Overlay */}
      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 10,
            color: "white",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "4px solid #f3f3f3",
              borderTop: "4px solid #3498db",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          ></div>
          <div style={{ marginTop: "16px", fontSize: "14px" }}>
            {status === "connecting" && "Connecting to stream..."}
            {status === "connected" && "Establishing video connection..."}
            {status === "streaming" && "Loading video..."}
          </div>
        </div>
      )}

      {/* Status Messages */}
      {!isLoading && (
        <>
          {status === "connecting" && <div>Connecting...</div>}
          {status === "connected" && <div>Connected, starting video...</div>}
          {status === "streaming" && !videoLoaded && (
            <div>Buffering video...</div>
          )}
          {status === "error" && <div>Connection failed</div>}
        </>
      )}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        controls={false}
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "#000",
          display:
            status === "streaming" || status === "connected" ? "block" : "none",
        }}
      />

      {/* Debug info */}
      <div style={{ fontSize: "12px", color: "#666", marginTop: "10px" }}>
        Status: {status} | Video Loaded: {videoLoaded ? "Yes" : "No"} | Loading:{" "}
        {isLoading ? "Yes" : "No"}
      </div>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default WebrtcPlayer;
