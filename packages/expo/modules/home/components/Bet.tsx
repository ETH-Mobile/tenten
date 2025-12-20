import { parseBalance, truncateAddress } from '@/utils/eth-mobile';
import { FontAwesome } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

type BetEvent = {
  id: bigint;
  bettor: string;
  amount: bigint;
  choice: number;
  timestamp: bigint;
};

export default function Bet({
  bet,
  currentAddress,
  onMatch,
  onCancel,
  isMatching,
  isCancelling,
  price,
  isHistory = false
}: {
  bet: BetEvent;
  currentAddress?: string;
  onMatch: (bet: BetEvent) => void;
  onCancel?: (bet: BetEvent) => void;
  isMatching: boolean;
  isCancelling?: boolean;
  price: number | null;
  isHistory?: boolean;
}) {
  const isMyBet =
    currentAddress && bet.bettor.toLowerCase() === currentAddress.toLowerCase();

  const betAmount = parseBalance(bet.amount);
  const usdAmount = price ? (Number(betAmount) * price).toFixed(2) : null;

  const date = new Date(Number(bet.timestamp) * 1000);
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ];
  const formattedDate = `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;

  const choiceLabel = bet.choice === 0 ? 'Even' : 'Odd';

  return (
    <TouchableOpacity
      disabled={isHistory || isMyBet || isMatching}
      onPress={() => !isHistory && !isMyBet && !isMatching && onMatch(bet)}
      className="w-full bg-white border border-gray-200 rounded-2xl p-4 mb-3 shadow-sm"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-lg font-semibold font-[Poppins] text-gray-900 mb-1">
            {choiceLabel}
          </Text>
          <Text className="text-2xl font-bold font-[Poppins] text-gray-900 mb-3">
            ${usdAmount || betAmount}
          </Text>
        </View>

        <View className="items-end">
          <Text className="text-lg font-semibold font-[Poppins] text-gray-500">
            #{bet.id.toString()}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between mt-2">
        <Text className="text-sm text-gray-600 font-[Poppins]">
          Placed by {truncateAddress(bet.bettor)} on {formattedDate}
        </Text>
        {!isHistory && (
          <View className="flex-row items-center gap-x-3">
            {isMyBet && onCancel ? (
              <TouchableOpacity
                onPress={() => onCancel(bet)}
                disabled={isCancelling}
                className="p-2"
              >
                {isCancelling ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <FontAwesome name="times-circle" size={20} color="#EF4444" />
                )}
              </TouchableOpacity>
            ) : (
              !isMyBet && (
                <TouchableOpacity
                  onPress={() => onMatch(bet)}
                  disabled={isMatching}
                  className="p-2"
                >
                  {isMatching ? (
                    <ActivityIndicator size="small" color="#36C566" />
                  ) : (
                    <FontAwesome name="handshake-o" size={20} color="#36C566" />
                  )}
                </TouchableOpacity>
              )
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
