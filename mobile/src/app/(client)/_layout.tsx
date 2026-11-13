import { Tabs } from "expo-router";
import { colors } from "../../lib/theme";

export default function ClientPortalLayout() {
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
      <Tabs.Screen name="workers" options={{ title: "Workers", tabBarLabel: "Workers" }} />
      <Tabs.Screen name="recruitment" options={{ title: "Recruitment", tabBarLabel: "Requests" }} />
      <Tabs.Screen name="change-password" options={{ href: null, title: "Change password" }} />
    </Tabs>
  );
}
