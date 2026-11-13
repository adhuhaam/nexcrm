import { Tabs } from "expo-router";
import { colors } from "../../lib/theme";

export default function EmployerPortalLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.brand,
        tabBarActiveTintColor: colors.brand,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Overview", tabBarLabel: "Home" }} />
      <Tabs.Screen name="workers" options={{ title: "Employees", tabBarLabel: "Staff" }} />
      <Tabs.Screen name="invoices" options={{ title: "Invoices", tabBarLabel: "Invoices" }} />
      <Tabs.Screen name="change-password" options={{ href: null, title: "Change password" }} />
    </Tabs>
  );
}
