import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
} from "react-native";

export function KeyboardAwareScrollView(props: ScrollViewProps) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView {...props} keyboardShouldPersistTaps="handled" />
    </KeyboardAvoidingView>
  );
}
