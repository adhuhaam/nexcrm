import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#f4f1ec" },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "700", color: "#1c1917" },
        tabBarActiveTintColor: "#1f4b3a",
        tabBarInactiveTintColor: "#78716c",
        tabBarStyle: { backgroundColor: "#fff", borderTopColor: "#e7e5e4" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" color={typeof color === "string" ? color : "#78716c"} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="companies"
        options={{
          title: "Companies",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business-outline" color={typeof color === "string" ? color : "#78716c"} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="employees"
        options={{
          title: "Employees",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" color={typeof color === "string" ? color : "#78716c"} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu-outline" color={typeof color === "string" ? color : "#78716c"} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
