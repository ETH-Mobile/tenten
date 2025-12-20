import React from 'react';
import { Text, TouchableOpacity } from 'react-native';

export default function TabButton({
  label,
  isActive,
  onPress
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`px-4 py-2 rounded-xl ${
        isActive ? 'bg-primary' : 'bg-gray-100'
      }`}
    >
      <Text
        className={`text-sm font-[Poppins] ${
          isActive ? 'text-white' : 'text-gray-700'
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
