import PlaceBetModal from '@/components/modals/PlaceBetModal';
import {
  useAccount,
  useBalance,
  useCryptoPrice,
  useDeployedContractInfo,
  useNetwork,
  useScaffoldEventHistory,
  useScaffoldReadContract,
  useScaffoldWriteContract
} from '@/hooks/eth-mobile';
import Bet from '@/modules/home/components/Bet';
import TabButton from '@/modules/home/components/TabButton';
import ResultModal from '@/modules/home/modals/ResultModal';
import Device from '@/utils/device';
import { parseBalance } from '@/utils/eth-mobile';
import { Ionicons } from '@expo/vector-icons';
import { Contract, JsonRpcProvider } from 'ethers';
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

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('ACTIVE');
  const [matchingBetId, setMatchingBetId] = useState<bigint | null>(null);
  const [cancellingBetId, setCancellingBetId] = useState<bigint | null>(null);
  const [showWinModal, setShowWinModal] = useState(false);
  const [showLoseModal, setShowLoseModal] = useState(false);
  const [showPlaceBetModal, setShowPlaceBetModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [betWinners, setBetWinners] = useState<Map<string, string>>(new Map());
  const [betChallengers, setBetChallengers] = useState<Map<string, string>>(
    new Map()
  );

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

  const { data: resolvedEvents } = useScaffoldEventHistory({
    contractName: 'TenTen',
    eventName: 'BetResolved',
    fromBlock: 0n,
    watch: true
  });

  const { data: cancelledEvents } = useScaffoldEventHistory({
    contractName: 'TenTen',
    eventName: 'BetCancelled',
    fromBlock: 0n,
    watch: true
  });

  const { writeContractAsync } = useScaffoldWriteContract({
    contractName: 'TenTen'
  });

  const { data: earnings } = useScaffoldReadContract({
    contractName: 'TenTen',
    functionName: 's_earnings',
    args: account?.address ? [account.address] : undefined,
    enable: !!account?.address,
    watch: true
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

  // Get sets of resolved and cancelled bet IDs
  const resolvedBetIds = useMemo(() => {
    if (!resolvedEvents) return new Set<string>();
    return new Set(
      resolvedEvents
        .map(ev => {
          const args = ev.args || [];
          if (args.length < 1) return null;
          return String(args[0]);
        })
        .filter(Boolean) as string[]
    );
  }, [resolvedEvents]);

  const cancelledBetIds = useMemo(() => {
    if (!cancelledEvents) return new Set<string>();
    return new Set(
      cancelledEvents
        .map(ev => {
          const args = ev.args || [];
          if (args.length < 1) return null;
          return String(args[0]);
        })
        .filter(Boolean) as string[]
    );
  }, [cancelledEvents]);

  const filteredBets = useMemo(() => {
    if (activeTab === 'ACTIVE') {
      // Show only bets created by the connected account that are still pending
      return bets.filter(bet => {
        const isMyBet =
          account?.address &&
          bet.bettor.toLowerCase() === account.address.toLowerCase();
        const betIdStr = bet.id.toString();
        const isPending =
          !resolvedBetIds.has(betIdStr) && !cancelledBetIds.has(betIdStr);
        return isMyBet && isPending;
      });
    }
    if (activeTab === 'ALL') {
      // Show all pending bets that are NOT created by the user (matchable bets)
      return bets.filter(bet => {
        const isMyBet =
          account?.address &&
          bet.bettor.toLowerCase() === account.address.toLowerCase();
        const betIdStr = bet.id.toString();
        const isPending =
          !resolvedBetIds.has(betIdStr) && !cancelledBetIds.has(betIdStr);
        return !isMyBet && isPending;
      });
    }
    if (activeTab === 'HISTORY') {
      // Show resolved or cancelled bets
      return bets.filter(bet => {
        const betIdStr = bet.id.toString();
        return resolvedBetIds.has(betIdStr) || cancelledBetIds.has(betIdStr);
      });
    }
    return bets;
  }, [bets, activeTab, account?.address, resolvedBetIds, cancelledBetIds]);

  const balanceUSD = useMemo(() => {
    if (!balance || !price) return null;
    const ethBalance = parseBalance(balance);
    return (Number(ethBalance) * price).toFixed(2);
  }, [balance, price]);

  const earningsDisplay = useMemo(() => {
    if (earnings === null || earnings === undefined || !price) return null;

    // Convert bigint to number, handling negative values
    const earningsBigInt = earnings as bigint;
    const isNegative = earningsBigInt < 0n;
    const absEarnings = isNegative ? -earningsBigInt : earningsBigInt;

    // Format the absolute value in ETH
    const formattedAmount = parseBalance(absEarnings);
    const numericAmount = Number(formattedAmount);

    // Convert to USD
    const usdAmount = (numericAmount * price).toFixed(2);

    // Determine sign and color based on the original value
    if (earningsBigInt > 0n) {
      return {
        text: `+$${usdAmount}`,
        color: '#36C566' // green
      };
    } else if (earningsBigInt === 0n) {
      return {
        text: `$${usdAmount}`,
        color: '#36C566' // green
      };
    } else {
      return {
        text: `-$${usdAmount}`,
        color: '#EF4444' // red
      };
    }
  }, [earnings, price]);

  useEffect(() => {
    if (balance && price === null) {
      fetchPrice();
    }
  }, [balance, price]);

  // Fetch winners and challengers for resolved bets
  useEffect(() => {
    if (!deployedContractData || !resolvedEvents) return;

    const fetchBetData = async () => {
      const provider = new JsonRpcProvider(network.provider);
      const contract = new Contract(
        deployedContractData.address,
        deployedContractData.abi as any,
        provider
      );

      const betIds = resolvedEvents
        .map(ev => {
          const args = ev.args || [];
          return args.length > 0 ? String(args[0]) : null;
        })
        .filter(Boolean) as string[];

      // Fetch all bet data in parallel
      const betDataPromises = betIds.map(betId =>
        contract
          .getBet(betId)
          .then((betData: any) => ({ betId, betData }))
          .catch((error: any) => {
            console.error(`Error fetching bet ${betId}:`, error);
            return null;
          })
      );

      const results = await Promise.all(betDataPromises);

      const newWinners = new Map<string, string>();
      const newChallengers = new Map<string, string>();

      results.forEach(result => {
        if (!result) return;
        const { betId, betData } = result;
        if (betData) {
          if (betData.winner) {
            newWinners.set(betId, String(betData.winner));
          }
          if (betData.challenger) {
            newChallengers.set(betId, String(betData.challenger));
          }
        }
      });

      // Update state
      if (newWinners.size > 0) {
        setBetWinners(prev => {
          const updated = new Map(prev);
          newWinners.forEach((winner, betId) => {
            updated.set(betId, winner);
          });
          return updated;
        });
      }

      if (newChallengers.size > 0) {
        setBetChallengers(prev => {
          const updated = new Map(prev);
          newChallengers.forEach((challenger, betId) => {
            updated.set(betId, challenger);
          });
          return updated;
        });
      }
    };

    fetchBetData();
  }, [resolvedEvents, deployedContractData, network.provider]);

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

  const handleCancelBet = async (bet: BetEvent) => {
    if (cancellingBetId || !deployedContractData) return;
    try {
      setCancellingBetId(bet.id);

      await writeContractAsync({
        functionName: 'cancelBet',
        args: [bet.id]
      });
    } catch (e) {
      // Reverts and errors are handled by write hook toasts
    } finally {
      setCancellingBetId(null);
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
          It's your luck against mine
        </Text>

        {earningsDisplay ? (
          <Text
            className="text-4xl text-center font-bold font-[Poppins] mb-4"
            style={{ color: earningsDisplay.color }}
          >
            {earningsDisplay.text}
          </Text>
        ) : (
          <Text className="text-4xl text-center font-bold font-[Poppins] text-green-400 mb-4">
            $0.00
          </Text>
        )}

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
              .map(bet => {
                const betIdStr = bet.id.toString();
                const isResolved = resolvedBetIds.has(betIdStr);
                const winner = isResolved ? betWinners.get(betIdStr) : null;
                const challenger = isResolved
                  ? betChallengers.get(betIdStr)
                  : null;

                // Determine result: 'win', 'lose', or null (for cancelled bets or if user didn't participate)
                let result: 'win' | 'lose' | null = null;
                if (isResolved && account?.address) {
                  const isUserBettor =
                    bet.bettor.toLowerCase() === account.address.toLowerCase();
                  const isUserChallenger =
                    challenger?.toLowerCase() === account.address.toLowerCase();

                  // User participated if they were the bettor or the challenger
                  if (isUserBettor || isUserChallenger) {
                    const isUserWinner =
                      winner?.toLowerCase() === account.address.toLowerCase();
                    result = isUserWinner ? 'win' : 'lose';
                  }
                }

                return (
                  <Bet
                    key={bet.id.toString()}
                    bet={bet}
                    currentAddress={account?.address}
                    isMatching={
                      matchingBetId !== null && matchingBetId === bet.id
                    }
                    isCancelling={
                      cancellingBetId !== null && cancellingBetId === bet.id
                    }
                    onMatch={handleMatchBet}
                    onCancel={handleCancelBet}
                    price={price}
                    isHistory={activeTab === 'HISTORY'}
                    result={result}
                  />
                );
              })
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
