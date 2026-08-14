using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace GatewayService.Services;

[StructLayout(LayoutKind.Sequential, Pack = 1)]
public unsafe struct ParticleOutputArea {
	public uint TriggerCount;
	public fixed uint TriggerSlotIndices[16];
	public fixed double Scores[16];
	public ulong CalculatedAtNs;
	public fixed byte Reserved[128];
}

public record TriggerPostDto (
	uint SlotIndex,
	string Uri,
	string Author,
	string Text,
	double ContributionScore
);

public unsafe class CytoplasmReader : IDisposable {
	private const int CYTOPLASM_IPC_KEY = 0x41504549;
	private const int TEXT_URI_MAX_LEN = 256;
	private const int TEXT_AUTHOR_MAX_LEN = 128;
	private const int TEXT_BODY_MAX_LEN = 2048;
	private const int TEXT_SLOT_SIZE = 19200;

	private const int PARTICLE_OUTPUT_OFFSET = 0x0100;
	private const long TEXT_LRU_OFFSET = 0x04004000;

	[DllImport("libc", SetLastError = true)]
	private static extern int shmget(int key, nuint size, int shmflg);

	[DllImport("libc", SetLastError = true)]
	private static extern void* shmat(int shmid, void* shmaddr, int shmflg);

	[DllImport("libc", SetLastError = true)]
	private static extern int shmdt(void* shmaddr);

	private readonly void* _shmPtr;
	private readonly int _shmId;

	public CytoplasmReader() {
		_shmId = shmget(CYTOPLASM_IPC_KEY, 0, 0);
		if (_shmId < 0) {
			Console.WriteLine("[C# Gateway Warning] Cytoplasm III Shared Memory not found. Run Go Ingester first.");
			_shmPtr = null;
			return;
		}

		_shmPtr = shmat(_shmId, null, 0);
		if (_shmPtr == (void*)-1) {
			Console.WriteLine("[C# Gateway Error] Failed to attach Shared Memory.");
			_shmPtr = null;
		}
	}

	public List<TriggerPostDto> ReadTopTriggerPosts() {
		var posts = new List<TriggerPostDto>();
		if (_shmPtr == null) {
			return posts;
		}

		byte* basePtr = (byte*)_shmPtr;
		ParticleOutputArea* particleArea = (ParticleOutputArea*)(basePtr + PARTICLE_OUTPUT_OFFSET);
		uint count = Math.Min(particleArea->TriggerCount, 16U);
		byte* textLruBase = basePtr + TEXT_LRU_OFFSET;

		for (int i = 0; i < count; i++) {
			uint slotIdx = particleArea->TriggerSlotIndices[i] % 1000U;
			byte* slotPtr = textLruBase + (slotIdx * TEXT_SLOT_SIZE);

			string uri = ReadUtf8String(slotPtr + 16, TEXT_URI_MAX_LEN);
			string author = ReadUtf8String(slotPtr + 16 + TEXT_URI_MAX_LEN, TEXT_AUTHOR_MAX_LEN);
			string text = ReadUtf8String(slotPtr + 16 + TEXT_URI_MAX_LEN + TEXT_AUTHOR_MAX_LEN, TEXT_BODY_MAX_LEN);

			posts.Add(new TriggerPostDto(slotIdx, uri, author, text, particleArea->Scores[i]));
		}
		return posts;
	}

	private static string ReadUtf8String(byte* ptr, int maxLen) {
		int len = 0;
		while (len < maxLen && ptr[len] != 0) {
			len++;
		}
		return len == 0 ? string.Empty : Encoding.UTF8.GetString(ptr, len);
	}

	public void Dispose() {
		if (_shmPtr != null && _shmPtr != (void*)-1) {
			shmdt(_shmPtr);
		}
	}
}


