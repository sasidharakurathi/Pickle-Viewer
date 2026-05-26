import os
import pickle
import struct
import numpy as np
import pandas as pd

# Define a custom local class
class CustomModel:
    def __init__(self, name, version):
        self.name = name
        self.version = version
        self.weights = [1.2, -0.4, 3.5]
        self.config = {"layer_sizes": [64, 32, 10], "activation": "relu"}

    def __repr__(self):
        return f"CustomModel(name={self.name}, version={self.version})"

# Define a "dangerous" class that implements __reduce__
class MaliciousPayload:
    def __reduce__(self):
        # In a real payload this would execute arbitrary commands
        # Here we just run a benign echo command
        return (os.system, ('echo "Benign Security Test Execution!"',))

class MockParameter:
    def __init__(self, shape):
        self.shape = shape
        self.dtype = "torch.float32"
        self.requires_grad = True
    def numel(self):
        prod = 1
        for s in self.shape: prod *= s
        return prod

class MockLayer:
    def __init__(self, in_features, out_features):
        self.weight = MockParameter([out_features, in_features])
        self.bias = MockParameter([out_features])
    def named_children(self):
        return []
    def parameters(self):
        return [self.weight, self.bias]
    def named_parameters(self, recurse=True):
        return [("weight", self.weight), ("bias", self.bias)]

class MockNeuralNetwork:
    def __init__(self):
        self.conv1 = MockLayer(3, 16)
        self.fc1 = MockLayer(16 * 8 * 8, 120)
        self.fc2 = MockLayer(120, 10)
    def named_children(self):
        return [("conv1", self.conv1), ("fc1", self.fc1), ("fc2", self.fc2)]
    def parameters(self):
        params = []
        for name, child in self.named_children():
            params.extend(child.parameters())
        return params
    def named_parameters(self, recurse=True):
        return []

def main():
    out_dir = "test_pickles"
    os.makedirs(out_dir, exist_ok=True)
    print(f"Creating test pickles in: {out_dir}")

    # 1. Simple Dictionary
    simple_data = {
        "string": "Hello, Pickle Viewer!",
        "integer": 42,
        "float": 3.14159,
        "boolean": True,
        "null_val": None,
        "list": [1, 2, 3, "four", {"nested": "value"}],
        "tuple": (10, 20, 30),
        "set": {"apple", "banana", "cherry"},
        "nested_dict": {
            "a": 1,
            "b": [True, False],
            "c": {"deep_key": "deep_value"}
        }
    }
    with open(os.path.join(out_dir, "simple_dict.pkl"), "wb") as f:
        pickle.dump(simple_data, f)
    print("Created simple_dict.pkl")

    # 2. Scientific ML Data (Numpy + Pandas)
    arr = np.linspace(0, 10, 100).reshape(10, 10)
    df = pd.DataFrame({
        "A": np.random.randn(50),
        "B": np.random.choice(["Red", "Blue", "Green"], 50),
        "C": np.arange(50) * 1.5,
        "D": np.sin(np.linspace(0, 2*np.pi, 50))
    })
    
    ml_data = {
        "numpy_array": arr,
        "pandas_dataframe": df,
        "some_meta": "ML experiment results",
        "nested_arrays": {
            "sub_array_1": np.zeros((3, 3, 3)),
            "sub_array_2": np.ones((5, 5))
        }
    }
    with open(os.path.join(out_dir, "ml_data.pkl"), "wb") as f:
        pickle.dump(ml_data, f)
    print("Created ml_data.pkl")

    # 3. Image Pickle
    img_data = np.zeros((32, 32, 3), dtype=np.uint8)
    for r in range(32):
        for c in range(32):
            img_arr = [int(r * 255 / 32), int(c * 255 / 32), int((r + c) * 128 / 32)]
            img_data[r, c] = img_arr
            
    image_pickle = {
        "title": "Gradient Image Example",
        "image_data": img_data,
        "resolution": "32x32 RGB"
    }
    with open(os.path.join(out_dir, "image_data.pkl"), "wb") as f:
        pickle.dump(image_pickle, f)
    print("Created image_data.pkl")

    # 4. Custom Class Pickle
    model_instance = CustomModel("ResNet-Pickle", 2.1)
    with open(os.path.join(out_dir, "custom_class.pkl"), "wb") as f:
        pickle.dump(model_instance, f)
    print("Created custom_class.pkl")

    # 5. Dangerous Pickle
    dangerous_data = {
        "safe_key": "All seems normal...",
        "payload": MaliciousPayload()
    }
    with open(os.path.join(out_dir, "dangerous.pkl"), "wb") as f:
        pickle.dump(dangerous_data, f)
    print("Created dangerous.pkl")

    # 6. Audio Waveform Pickle
    sr = 16000
    duration = 1.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    waveform = np.sin(2 * np.pi * 440 * t) * 0.5
    
    audio_pickle = {
        "description": "Playable Audio datasets",
        "audio_dict": {
            "waveform": waveform,
            "sample_rate": sr
        },
        "audio_tuple": (waveform, sr)
    }
    with open(os.path.join(out_dir, "audio_waveform.pkl"), "wb") as f:
        pickle.dump(audio_pickle, f)
    print("Created audio_waveform.pkl")

    # 7. Video sequence (4D NumPy array)
    frames = 20
    H, W, C = 64, 64, 3
    video_data = np.zeros((frames, H, W, C), dtype=np.uint8)
    for f in range(frames):
        for r in range(H):
            for c in range(W):
                video_data[f, r, c] = [
                    int(((r + f * 4) % H) * 255 / H),
                    int(((c + f * 4) % W) * 255 / W),
                    int(128)
                ]
    with open(os.path.join(out_dir, "video_sequence.pkl"), "wb") as f:
        pickle.dump(video_data, f)
    print("Created video_sequence.pkl")

    # 8. Matplotlib Figure Plot
    try:
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(5, 3))
        x = np.linspace(0, 10, 100)
        y = np.sin(x)
        ax.plot(x, y, label="y = sin(x)", color="purple")
        ax.set_title("Test Plot Chart")
        ax.legend()
        
        with open(os.path.join(out_dir, "matplotlib_chart.pkl"), "wb") as f:
            pickle.dump(fig, f)
        print("Created matplotlib_chart.pkl")
        plt.close(fig)
    except Exception as e:
        print(f"Skipping matplotlib_chart.pkl generation (matplotlib not installed: {e})")

    # 9. Neural Network (PyTorch nn.Module mock structure)
    network = MockNeuralNetwork()
    with open(os.path.join(out_dir, "neural_network.pkl"), "wb") as f:
        pickle.dump(network, f)
    print("Created neural_network.pkl")

    # 10. Raw File Bytes (Image & Sound bytes pickled directly)
    # Create a real 32x32 colored PNG image
    png_bytes = b''
    try:
        from PIL import Image as PILImage
        import io
        img = PILImage.new('RGB', (32, 32), color=(142, 68, 173))  # Solid purple block
        # Draw a small border / symbol to make it look premium
        from PIL import ImageDraw
        draw = ImageDraw.Draw(img)
        draw.line((0, 0, 31, 31), fill=(230, 126, 34), width=2)
        
        png_io = io.BytesIO()
        img.save(png_io, format="PNG")
        png_bytes = png_io.getvalue()
    except Exception:
        # Fallback to a 1x1 transparent PNG if PIL not available
        png_bytes = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc`\x60\x60\x60\x00\x00\x00\x04\x00\x01\xa7\xbf\xcd\xe4\x00\x00\x00\x00IEND\xaeB`\x82'
    
    # Create a real 1-second 8000Hz WAV file with 440Hz sine wave tone
    import wave
    import io
    import struct
    import math
    wav_io = io.BytesIO()
    with wave.open(wav_io, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(8000)
        
        samples = []
        for i in range(8000):
            t = i / 8000.0
            sample_val = int(math.sin(2 * math.pi * 440.0 * t) * 16384)
            samples.append(sample_val)
            
        pcm_bytes = struct.pack(f'<{len(samples)}h', *samples)
        wav_file.writeframes(pcm_bytes)
    wav_bytes = wav_io.getvalue()
    
    raw_media_pickle = {
        "description": "Raw binary file assets pickled directly as bytes objects",
        "raw_png_bytes": png_bytes,
        "raw_wav_bytes": wav_bytes
    }
    with open(os.path.join(out_dir, "raw_media_bytes.pkl"), "wb") as f:
        pickle.dump(raw_media_pickle, f)
    print("Created raw_media_bytes.pkl")

    # 11. Merged Complex Edge Case Pickle
    merged_data = {
        "description": "Merged complex structures containing extreme edge cases and nested ML data formats.",
        "nesting_stress_test": [
            {
                "dict_key": (
                    100, 
                    200, 
                    {
                        "deep_list": [
                            {"nested_set": {"cyan", "magenta", "yellow"}},
                            np.array([[1.0, 2.0], [3.0, 4.0]]),
                            pd.DataFrame({"X": [10, 20], "Y": [30, 40]})
                        ]
                    }
                )
            }
        ],
        "ml_stress_test": {
            "pytorch_module": MockNeuralNetwork(),
            "numpy_mix": [
                np.linspace(0, 1, 10),
                np.zeros((16, 16, 3), dtype=np.uint8),  # A small image!
                np.ones((5, 16, 16, 1), dtype=np.float32)  # A small video!
            ]
        },
        "media_mix": {
            "sound_waveform_tuple": (np.cos(2 * np.pi * 220 * np.linspace(0, 0.5, 4000)) * 0.5, 8000),
            "raw_image_bytes": png_bytes,
            "raw_sound_bytes": wav_bytes,
            "base64_image_data_uri": "data:image/png;base64," + __import__('base64').b64encode(png_bytes).decode('utf-8'),
            "base64_audio_raw_string": __import__('base64').b64encode(wav_bytes).decode('utf-8')
        },
        "value_stress_test": {
            "float_nan": float('nan'),
            "float_inf": float('inf'),
            "float_neginf": float('-inf'),
            "empty_list": [],
            "empty_dict": {},
            "empty_set": set(),
            "empty_string": "",
            "unresolved_class": CustomModel("NestedMockModel", 3.0),
            "huge_list": list(range(500))  # to test lazy-loading truncation
        }
    }
    with open(os.path.join(out_dir, "merged_edge_cases.pkl"), "wb") as f:
        pickle.dump(merged_data, f)
    print("Created merged_edge_cases.pkl")

    print("\nAll test pickle files successfully generated!")

if __name__ == "__main__":
    main()
