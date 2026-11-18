import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { mockFriends, outgoingRequest, type FriendMock } from '@/mocks/friends';

export const useFriendsStore = defineStore('friends', () => {
  const friends = ref<FriendMock[]>([...mockFriends]);
  const outgoing = ref<typeof outgoingRequest | null>({ ...outgoingRequest });

  const listening = computed(() => friends.value.filter((friend) => friend.live !== null));

  function remove(id: number) {
    friends.value = friends.value.filter((friend) => friend.id !== id);
  }

  function cancelOutgoing() {
    outgoing.value = null;
  }

  return { friends, outgoing, listening, remove, cancelOutgoing };
});
