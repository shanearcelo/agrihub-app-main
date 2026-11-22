// src/components/ReceiptCameraModal.tsx
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera, RefreshCw, X } from "lucide-react-native";
import { useRef, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Colors } from "../constants/theme";
import type { UploadableImageAsset } from "../lib/uploadImageToSupabase";

interface ReceiptCameraModalProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (asset: UploadableImageAsset) => void;
}

export function ReceiptCameraModal({
  visible,
  onClose,
  onCapture,
}: ReceiptCameraModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [capturing, setCapturing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView | null>(null);

  async function handleTakePicture() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    setCameraError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: true,
      });
      if (photo?.uri) {
        onCapture({
          uri: photo.uri,
          base64: photo.base64 ?? null,
          mimeType: "image/jpeg",
        });
        onClose();
      }
    } catch (error) {
      setCameraError(
        error instanceof Error
          ? error.message
          : "Could not capture photo. Please try again.",
      );
    } finally {
      setCapturing(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
            <X size={22} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Take Receipt Photo</Text>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() =>
              setFacing((prev) => (prev === "back" ? "front" : "back"))
            }
          >
            <RefreshCw size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        {!permission ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#FFF" />
          </View>
        ) : !permission.granted ? (
          <View style={styles.centerBox}>
            <Camera size={40} color="#FFF" />
            <Text style={styles.permTitle}>Camera Access Needed</Text>
            <Text style={styles.permSub}>
              Allow camera access to take a clear photo of your GCash receipt.
            </Text>
            <TouchableOpacity
              style={styles.permBtn}
              onPress={() => void requestPermission()}
            >
              <Text style={styles.permBtnText}>Allow Camera</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraWrapper}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing={facing}
              onMountError={(e) =>
                setCameraError(
                  e.message ||
                    "No camera detected on this device. Please use Upload Receipt instead.",
                )
              }
            />

            <View style={styles.guideFrame} pointerEvents="none">
              <Text style={styles.guideText}>
                Align the GCash receipt inside the frame (Ref No., Amount &amp;
                Number must be clear)
              </Text>
            </View>

            {cameraError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{cameraError}</Text>
              </View>
            ) : null}

            <View style={styles.bottomBar}>
              <TouchableOpacity
                style={[styles.shutterOuter, capturing && { opacity: 0.6 }]}
                onPress={() => void handleTakePicture()}
                disabled={capturing}
              >
                <View style={styles.shutterInner}>
                  {capturing ? (
                    <ActivityIndicator color={Colors.primary} />
                  ) : null}
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 48,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: "rgba(0,0,0,0.75)",
    zIndex: 10,
  },
  title: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "800",
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  permTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 8,
  },
  permSub: {
    color: "#D1D5DB",
    fontSize: 13,
    textAlign: "center",
    maxWidth: 300,
  },
  permBtn: {
    marginTop: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "800",
  },
  cameraWrapper: {
    flex: 1,
    position: "relative",
  },
  camera: {
    flex: 1,
  },
  guideFrame: {
    position: "absolute",
    top: "12%",
    left: "10%",
    right: "10%",
    bottom: "24%",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.75)",
    borderRadius: 18,
    justifyContent: "flex-end",
    padding: 12,
  },
  guideText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  errorBanner: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 12,
  },
  errorText: {
    color: "#991B1B",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterOuter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
});
