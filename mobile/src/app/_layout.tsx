import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth";
import { colors } from "../lib/theme";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, session } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const onLogin = segments[0] === "login";
    if (!session && !onLogin) router.replace("/login");
    if (session && onLogin) {
      if (session.role.slug === "employee_self_service") {
        router.replace(session.mustChangePassword ? "/(ess)/change-password" : "/(ess)");
        return;
      }
      if (session.role.slug === "legal_employer") {
        router.replace(session.mustChangePassword ? "/(employer)/change-password" : "/(employer)");
        return;
      }
      if (session.role.slug === "portal_client") {
        router.replace(session.mustChangePassword ? "/(client)/change-password" : "/(client)");
        return;
      }
      router.replace("/(tabs)");
    }
  }, [ready, session, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <AuthGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                headerStyle: { backgroundColor: colors.bg },
                headerShadowVisible: false,
                headerTintColor: colors.brand,
                headerTitleStyle: { fontWeight: "700", color: colors.ink },
              }}
            >
              <Stack.Screen name="login" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(ess)" />
              <Stack.Screen name="(employer)" />
              <Stack.Screen name="(client)" />
              <Stack.Screen name="companies/[id]" options={{ headerShown: true, title: "Company" }} />
              <Stack.Screen name="companies/form" options={{ headerShown: true, title: "Company form" }} />
              <Stack.Screen name="employees/[id]" options={{ headerShown: true, title: "Employee" }} />
              <Stack.Screen name="employees/form" options={{ headerShown: true, title: "Employee form" }} />
              <Stack.Screen name="clients/form" options={{ headerShown: true, title: "Client form" }} />
              <Stack.Screen name="loas/index" options={{ headerShown: true, title: "LOAs" }} />
              <Stack.Screen name="loas/[id]" options={{ headerShown: true, title: "LOA" }} />
              <Stack.Screen name="loas/form" options={{ headerShown: true, title: "New LOA" }} />
              <Stack.Screen name="allocations/index" options={{ headerShown: true, title: "Allocations" }} />
              <Stack.Screen name="allocations/form" options={{ headerShown: true, title: "Allocate staff" }} />
              <Stack.Screen name="allocations/[id]" options={{ headerShown: true, title: "Allocation" }} />
              <Stack.Screen name="payroll/form" options={{ headerShown: true, title: "New pay run" }} />
              <Stack.Screen name="payroll/[id]" options={{ headerShown: true, title: "Pay run" }} />
              <Stack.Screen name="projects/index" options={{ headerShown: true, title: "Projects" }} />
              <Stack.Screen name="projects/[id]" options={{ headerShown: true, title: "Project" }} />
              <Stack.Screen name="work-permits/index" options={{ headerShown: true, title: "Work permits" }} />
              <Stack.Screen name="work-permits/form" options={{ headerShown: true, title: "Work permit" }} />
              <Stack.Screen name="expenses/index" options={{ headerShown: true, title: "Expenses" }} />
              <Stack.Screen name="expenses/form" options={{ headerShown: true, title: "Expense" }} />
            </Stack>
          </AuthGate>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
