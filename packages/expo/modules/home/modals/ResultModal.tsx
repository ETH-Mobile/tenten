import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

export default function ResultModal({
  visible,
  type,
  onClose
}: {
  visible: boolean;
  type: 'win' | 'lose';
  onClose: () => void;
}) {
  if (!visible) return null;

  const isWin = type === 'win';

  return (
    <View className="absolute inset-0 bg-black/40 items-center justify-center z-50">
      <View className="w-[85%] bg-white rounded-3xl p-6 items-center">
        <Ionicons
          name={isWin ? 'trophy-outline' : 'close-circle-outline'}
          size={52}
          color={isWin ? '#16a34a' : '#ef4444'}
        />
        <Text className="mt-4 text-2xl font-[Poppins]">
          {isWin ? 'You Won!' : 'You Lost'}
        </Text>
        <Text className="mt-2 text-center text-base text-gray-600 font-[Poppins]">
          {isWin
            ? 'Congrats! The odds were in your favor.'
            : 'Better luck next time. Try matching another bet.'}
        </Text>

        <TouchableOpacity
          onPress={onClose}
          className="mt-5 bg-primary rounded-2xl px-6 py-3"
        >
          <Text className="text-white text-base font-[Poppins]">Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
