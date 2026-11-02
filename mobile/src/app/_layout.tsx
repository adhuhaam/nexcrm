import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "../lib/auth";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, session } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const onLogin = segments[0] === "login";
    if (!session && !onLogin) router.replace("/login");
    if (session && onLogin) router.replace("/(tabs)");
  }, [ready, session, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f4f1ec" }}>
        <ActivityIndicator size="large" color="#1f4b3a" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <AuthGate>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#f4f1ec" } }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="companies/[id]" options={{ headerShown: true, title: "Company" }} />
          <Stack.Screen name="employees/[id]" options={{ headerShown: true, title: "Employee" }} />
          <Stack.Screen name="loas/index" options={{ headerShown: true, title: "LOAs" }} />
          <Stack.Screen name="loas/[id]" options={{ headerShown: true, title: "LOA" }} />
          <Stack.Screen name="clients/index" options={{ headerShown: true, title: "Clients" }} />
          <Stack.Screen name="allocations/index" options={{ headerShown: true, title: "Allocations" }} />
          <Stack.Screen name="payroll/index" options={{ headerShown: true, title: "Payroll" }} />
          <Stack.Screen name="projects/index" options={{ headerShown: true, title: "Projects" }} />
          <Stack.Screen name="work-permits/index" options={{ headerShown: true, title: "Work permits" }} />
        </Stack>
      </AuthGate>
    </AuthProvider>
  );
}
