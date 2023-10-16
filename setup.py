from setuptools import setup, find_packages

setup(
    name="supercompute",
    version="0.1.0",
    packages=find_packages(include=["supercompute", "supercompute.*"]),
    python_requires=">=3.10",
)


