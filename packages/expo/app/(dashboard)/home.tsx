import PlaceBetModal from '@/components/modals/PlaceBetModal';
import {
  useAccount,
  useBalance,
  useCryptoPrice,
  useDeployedContractInfo,
  useNetwork,
  useScaffoldEventHistory,
  useScaffoldWriteContract
} from '@/hooks/eth-mobile';
import Device from '@/utils/device';
import { parseBalance, truncateAddress } from '@/utils/eth-mobile';
import { Ionicons } from '@expo/vector-icons';
import { Contract, ethers, JsonRpcProvider } from 'ethers';
import { Link } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { parseEther } from 'viem';

type Choice = 'EVEN' | 'ODD';

type TabType = 'ACTIVE' | 'HISTORY' | 'ALL';

type BetEvent = {
  id: bigint;
  bettor: string;
  amount: bigint;
  choice: number;
  timestamp: bigint;
};

function TabButton({
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

function BetCard({
  bet,
  currentAddress,
  onMatch,
  isMatching,
  price
}: {
  bet: BetEvent;
  currentAddress?: string;
  onMatch: (bet: BetEvent) => void;
  isMatching: boolean;
  price: number | null;
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
      disabled={isMyBet || isMatching}
      onPress={() => !isMyBet && onMatch(bet)}
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
        {!isMyBet && (
          <TouchableOpacity
            onPress={() => onMatch(bet)}
            disabled={isMatching}
            className="p-2"
          >
            {isMatching ? (
              <ActivityIndicator size="small" color="#36C566" />
            ) : (
              <Ionicons name="chevron-forward" size={20} color="#36C566" />
            )}
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

function ResultModal({
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

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('ACTIVE');
  const [matchingBetId, setMatchingBetId] = useState<bigint | null>(null);
  const [showWinModal, setShowWinModal] = useState(false);
  const [showLoseModal, setShowLoseModal] = useState(false);
  const [showPlaceBetModal, setShowPlaceBetModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const account = useAccount();
  const network = useNetwork();
  const { balance } = useBalance({
    address: account?.address || '',
    watch: true
  });
  const { price, fetchPrice } = useCryptoPrice({
    priceID: network.coingeckoPriceId,
    enabled: true
  });

  const { data: deployedContractData } = useDeployedContractInfo({
    contractName: 'TenTen'
  });

  const { data: events, isLoading: isEventsLoading } = useScaffoldEventHistory({
    contractName: 'TenTen',
    eventName: 'BetCreated',
    fromBlock: 0n,
    watch: true
  });

  const { writeContractAsync } = useScaffoldWriteContract({
    contractName: 'TenTen'
  });

  const bets: BetEvent[] = useMemo(() => {
    if (!events) return [];
    return events
      .map(ev => {
        const args = ev.args || [];
        if (args.length < 5) return null;
        return {
          id: args[0] as bigint,
          bettor: String(args[1]),
          amount: args[2] as bigint,
          choice: Number(args[3]),
          timestamp: args[4] as bigint
        } as BetEvent;
      })
      .filter(Boolean) as BetEvent[];
  }, [events]);

  const filteredBets = useMemo(() => {
    if (activeTab === 'ACTIVE') {
      return bets.filter(bet => {
        const isMyBet =
          account?.address &&
          bet.bettor.toLowerCase() === account.address.toLowerCase();
        return !isMyBet;
      });
    }
    return bets;
  }, [bets, activeTab, account?.address]);

  const balanceUSD = useMemo(() => {
    if (!balance || !price) return null;
    const ethBalance = parseBalance(balance);
    return (Number(ethBalance) * price).toFixed(2);
  }, [balance, price]);

  useEffect(() => {
    if (balance && price === null) {
      fetchPrice();
    }
  }, [balance, price]);

  const handlePlaceBet = async (choice: Choice, amount: string) => {
    if (!amount || Number(amount) <= 0 || isCreating) return;

    try {
      setIsCreating(true);
      const value = parseEther(amount);
      const choiceValue = choice === 'EVEN' ? 0 : 1;

      await writeContractAsync({
        functionName: 'createBet',
        args: [choiceValue],
        value
      });

      setShowPlaceBetModal(false);
    } catch (e) {
      // Errors are already surfaced via global toast/transaction flow
    } finally {
      setIsCreating(false);
    }
  };

  const handleMatchBet = async (bet: BetEvent) => {
    if (matchingBetId || !deployedContractData) return;
    try {
      setMatchingBetId(bet.id);

      const value = bet.amount;

      const receipt = await writeContractAsync({
        functionName: 'matchBet',
        args: [bet.id],
        value
      });

      const provider = new JsonRpcProvider(network.provider);
      const contract = new Contract(
        deployedContractData.address,
        deployedContractData.abi as any,
        provider
      );

      const onChainBet = await contract.getBet(bet.id);
      const winner: string = onChainBet.winner;

      if (
        account?.address &&
        winner &&
        winner.toLowerCase() === account.address.toLowerCase()
      ) {
        setShowWinModal(true);
      } else {
        setShowLoseModal(true);
      }

      return receipt;
    } catch (e) {
      // Reverts and errors are handled by write hook toasts
    } finally {
      setMatchingBetId(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Top Header Section */}
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-lg font-semibold font-[Poppins] text-gray-900">
            ${balanceUSD || '0.00'}
          </Text>
          <View className="flex-row items-center gap-x-5">
            <Link href="/wallet" push asChild>
              <TouchableOpacity>
                <Ionicons
                  name="wallet-outline"
                  size={Device.getDeviceWidth() * 0.07}
                  color="#555"
                />
              </TouchableOpacity>
            </Link>

            <Link href="/settings" push asChild>
              <TouchableOpacity>
                <Ionicons
                  name="settings-outline"
                  size={Device.getDeviceWidth() * 0.07}
                  color="#555"
                />
              </TouchableOpacity>
            </Link>
          </View>
        </View>

        <Text className="text-3xl text-center font-bold font-[Poppins] text-gray-900 mb-1">
          Stay Schemin
        </Text>
        <Text className="text-sm text-center text-gray-600 font-[Poppins] mb-4">
          Today might be your lucky day.
        </Text>

        <Text className="text-4xl text-center font-bold font-[Poppins] text-green-400 mb-4">
          $250
        </Text>

        {/* Tabs */}
        <View className="flex-row gap-x-2 mb-4">
          <TabButton
            label="All"
            isActive={activeTab === 'ALL'}
            onPress={() => setActiveTab('ALL')}
          />
          <TabButton
            label="Active"
            isActive={activeTab === 'ACTIVE'}
            onPress={() => setActiveTab('ACTIVE')}
          />
          <TabButton
            label="History"
            isActive={activeTab === 'HISTORY'}
            onPress={() => setActiveTab('HISTORY')}
          />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-4">
          {isEventsLoading ? (
            <View className="items-center mt-6">
              <ActivityIndicator size="large" color="#36C566" />
            </View>
          ) : filteredBets.length === 0 ? (
            <View className="items-center mt-6">
              <Text className="text-sm text-gray-500 font-[Poppins] text-center">
                No bets yet. Create the first bet or wait for others to join.
              </Text>
            </View>
          ) : (
            filteredBets
              .slice()
              .reverse()
              .map(bet => (
                <BetCard
                  key={bet.id.toString()}
                  bet={bet}
                  currentAddress={account?.address}
                  isMatching={
                    matchingBetId !== null && matchingBetId === bet.id
                  }
                  onMatch={handleMatchBet}
                  price={price}
                />
              ))
          )}
        </View>
      </ScrollView>

      {/* Floating Action Button - Bottom Right */}
      <TouchableOpacity
        onPress={() => setShowPlaceBetModal(true)}
        className="absolute bottom-6 right-6 w-16 h-16 rounded-full bg-primary items-center justify-center shadow-lg"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8
        }}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>

      {/* Place Bet Modal */}
      <PlaceBetModal
        visible={showPlaceBetModal}
        onClose={() => setShowPlaceBetModal(false)}
        onPlaceBet={handlePlaceBet}
        isPlacing={isCreating}
      />

      <ResultModal
        visible={showWinModal}
        type="win"
        onClose={() => setShowWinModal(false)}
      />
      <ResultModal
        visible={showLoseModal}
        type="lose"
        onClose={() => setShowLoseModal(false)}
      />
    </SafeAreaView>
  );
}
