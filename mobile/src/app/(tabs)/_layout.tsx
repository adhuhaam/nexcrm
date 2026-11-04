import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { colors } from "../../lib/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "700", color: colors.ink, fontSize: 18 },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: colors.surfaceRaised,
          borderTopColor: colors.line,
          height: Platform.OS === "web" ? 64 : undefined,
          paddingTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={typeof color === "string" ? color : colors.muted} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="employees"
        options={{
          title: "People",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" color={typeof color === "string" ? color : colors.muted} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="companies"
        options={{
          title: "Firms",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business-outline" color={typeof color === "string" ? color : colors.muted} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: "Clients",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="briefcase-outline" color={typeof color === "string" ? color : colors.muted} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="payroll"
        options={{
          title: "Pay",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="card-outline" color={typeof color === "string" ? color : colors.muted} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal" color={typeof color === "string" ? color : colors.muted} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
