import {
  useAccount,
  useBalance,
  useCryptoPrice,
  useNetwork
} from '@/hooks/eth-mobile';
import { parseBalance } from '@/utils/eth-mobile';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView
} from '@gorhom/bottom-sheet';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

type Choice = 'EVEN' | 'ODD';

interface PlaceBetModalProps {
  visible: boolean;
  onClose: () => void;
  onPlaceBet: (choice: Choice, amount: string) => Promise<void>;
  isPlacing: boolean;
}

const QUICK_AMOUNTS = ['5', '10', '20', '50', '100', '200', '500', '1000'];

export default function PlaceBetModal({
  visible,
  onClose,
  onPlaceBet,
  isPlacing
}: PlaceBetModalProps) {
  const [choice, setChoice] = useState<Choice>('EVEN');
  const [amount, setAmount] = useState<string>('');
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const account = useAccount();
  const network = useNetwork();
  const { balance } = useBalance({
    address: account?.address || '',
    watch: true
  });
  const { price } = useCryptoPrice({
    priceID: network.coingeckoPriceId,
    enabled: true
  });

  const balanceUSD = useMemo(() => {
    if (!balance || !price) return null;
    const ethBalance = parseBalance(balance);
    return (Number(ethBalance) * price).toFixed(2);
  }, [balance, price]);

  const snapPoints = useMemo(() => ['75%'], []);

  useEffect(() => {
    if (visible) {
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
      // Reset form when modal closes
      setAmount('');
      setChoice('EVEN');
    }
  }, [visible]);
  // Convert USD amount to ETH before passing to onPlaceBet
  const handlePlaceBet = async () => {
    if (!amount || Number(amount) <= 0 || !price) return;

    // Convert entered USD amount to ETH value using price
    const ethAmount = (Number(amount) / price).toString();

    await onPlaceBet(choice, ethAmount);
    setAmount('');
  };

  const handleQuickAmount = (value: string) => {
    setAmount(value);
  };

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        onClose();
      }
    },
    [onClose]
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: '#fff' }}
      handleIndicatorStyle={{ backgroundColor: '#d1d5db' }}
      backdropComponent={renderBackdrop}
    >
      <BottomSheetView style={{ flex: 1, paddingHorizontal: 16 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {/* Title */}
          <Text className="text-2xl font-bold font-[Poppins] text-gray-900 mb-6">
            Place Bet
          </Text>

          {/* Even/Odd Selection */}
          <View className="flex-row gap-x-2 mb-6">
            <TouchableOpacity
              onPress={() => setChoice('EVEN')}
              className={`flex-1 py-4 rounded-2xl border-2 ${
                choice === 'EVEN'
                  ? 'bg-primary border-primary'
                  : 'bg-white border-gray-300'
              }`}
            >
              <Text
                className={`text-center text-lg font-[Poppins] ${
                  choice === 'EVEN' ? 'text-white' : 'text-gray-800'
                }`}
              >
                Even
              </Text>
            </TouchableOpacity>

            <View className="w-px bg-gray-300 mx-2" />

            <TouchableOpacity
              onPress={() => setChoice('ODD')}
              className={`flex-1 py-4 rounded-2xl border-2 ${
                choice === 'ODD'
                  ? 'bg-primary border-primary'
                  : 'bg-white border-gray-300'
              }`}
            >
              <Text
                className={`text-center text-lg font-[Poppins] ${
                  choice === 'ODD' ? 'text-white' : 'text-gray-800'
                }`}
              >
                Odd
              </Text>
            </TouchableOpacity>
          </View>

          {/* Amount Input */}
          <View className="border border-gray-300 rounded-2xl px-4 py-3 mb-2">
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="Enter amount"
              placeholderTextColor="#9CA3AF"
              className="text-base font-[Poppins] text-gray-900"
            />
          </View>
          {balanceUSD && (
            <Text className="text-sm text-gray-500 font-[Poppins] mb-6">
              Balance: ${balanceUSD}
            </Text>
          )}

          {/* Quick Amount Buttons */}
          <View className="flex-row flex-wrap gap-2 mb-6">
            {QUICK_AMOUNTS.map(quickAmount => (
              <TouchableOpacity
                key={quickAmount}
                onPress={() => handleQuickAmount(quickAmount)}
                className={`px-4 py-3 rounded-xl border ${
                  amount === quickAmount
                    ? 'bg-primary border-primary'
                    : 'bg-white border-gray-300'
                }`}
              >
                <Text
                  className={`text-sm font-[Poppins] ${
                    amount === quickAmount ? 'text-white' : 'text-gray-700'
                  }`}
                >
                  ${quickAmount}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Place Bet Button */}
          <TouchableOpacity
            onPress={handlePlaceBet}
            disabled={isPlacing || !amount || Number(amount) <= 0}
            className={`py-4 rounded-2xl flex-row items-center justify-center mb-6 ${
              isPlacing || !amount || Number(amount) <= 0
                ? 'bg-gray-300'
                : 'bg-primary'
            }`}
          >
            {isPlacing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="add-circle" size={24} color="#fff" />
                <Text className="ml-2 text-white text-lg font-[Poppins]">
                  Place Bet
                </Text>
              </>
            )}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
